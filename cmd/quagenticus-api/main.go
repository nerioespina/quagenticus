package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/events"
	"github.com/nespina/quagenticus/internal/handlers"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.New(ctx, cfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Pool.Close()

	api := handlers.New(database, cfg, storage.NewLocal(cfg.StoragePath))
	hub := events.NewHub(database.Pool)
	go hub.Run(ctx)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           Router(api, hub, cfg),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("starting server", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down server")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}
	slog.Info("server exited")
}

// Router wires every route with its authorization guard. Resource routes
// resolve the owning space first; missing or foreign resources answer 404.
func Router(api *handlers.API, hub *events.Hub, cfg config.Config) http.Handler {
	g := api.Guard()
	space := authz.SpaceParam("spaceId")

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httpx.SecurityHeaders)
	r.Use(httpx.CORS(cfg.AllowedOrigins))
	r.Use(auth.Authenticate(cfg.SecretKey, api))

	r.Get("/healthz", api.Health)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(httpx.LimitJSONBody(2 << 20))

		// Public
		r.Get("/health", api.Health)
		r.Post("/auth/login", api.Login)
		r.Post("/auth/refresh", api.Refresh)
		r.Post("/auth/logout", api.Logout)
		r.Get("/files/{id}", api.ServeFile)

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth)

			r.Get("/auth/me", api.Me)
			r.With(authz.RequireUser).Patch("/auth/me", api.UpdateMe)
			r.With(authz.RequireUser).Patch("/auth/password", api.ChangeOwnPassword)
			r.Get("/events", api.Events(hub))
			r.Get("/search", api.Search)
			r.With(authz.RequireUser).Get("/me/work", api.MyWork)

			// Notifications
			r.Get("/notifications", api.ListNotifications)
			r.Get("/notifications/count", api.NotificationCount)
			r.Post("/notifications/read-all", api.MarkAllNotificationsRead)
			r.Post("/notifications/{id}/read", api.MarkNotificationRead)

			// Account users
			r.Get("/users", api.ListUsers)
			r.With(g.RequireAccountAdmin).Post("/users", api.CreateUser)
			r.With(g.RequireAccountAdmin).Patch("/users/{id}", api.UpdateUser)
			r.With(g.RequireAccountAdmin).Patch("/users/{id}/password", api.ResetUserPassword)

			// Catalogs
			r.Get("/catalogs/trackers", api.Trackers)
			r.Get("/catalogs/priorities", api.Priorities)
			r.Get("/catalogs/statuses", api.Statuses)
			r.Get("/catalogs/labels", api.Labels)

			// Account administration
			r.Route("/admin", func(r chi.Router) {
				r.Use(g.RequireAccountAdmin)
				r.Post("/statuses", api.AdminSaveStatus)
				r.Put("/statuses/order", api.AdminReorderStatuses)
				r.Patch("/statuses/{id}", api.AdminSaveStatus)
				r.Delete("/statuses/{id}", api.AdminDeleteStatus)
				r.Post("/trackers", api.AdminSaveTracker)
				r.Patch("/trackers/{id}", api.AdminSaveTracker)
				r.Get("/trackers/{id}/transitions", api.AdminTransitions)
				r.Put("/trackers/{id}/transitions", api.AdminReplaceTransitions)
				r.Post("/priorities", api.AdminSavePriority)
				r.Patch("/priorities/{id}", api.AdminSavePriority)
				r.Get("/agents", api.ListAgents)
				r.Post("/agents", api.CreateAgent)
				r.Patch("/agents/{id}", api.UpdateAgent)
				r.Post("/agents/{id}/rotate-key", api.RotateAgentKey)
			})

			// Spaces
			r.Get("/spaces", api.ListSpaces)
			r.With(authz.RequireUser).Post("/spaces", api.CreateSpace)
			r.Route("/spaces/{spaceId}", func(r chi.Router) {
				viewer := g.Require(space, authz.Viewer)
				contributor := g.Require(space, authz.Contributor)
				maintainer := g.Require(space, authz.Maintainer)
				admin := g.Require(space, authz.Admin)

				r.With(viewer).Get("/", api.GetSpace)
				r.With(admin).Patch("/", api.UpdateSpace)

				r.With(viewer).Get("/members", api.ListSpaceMembers)
				r.With(admin).Post("/members", api.AddSpaceMember)
				r.With(admin).Patch("/members/{userId}", api.UpdateSpaceMember)
				r.With(admin).Delete("/members/{userId}", api.RemoveSpaceMember)

				r.With(viewer).Get("/labels", api.SpaceLabels)
				r.With(contributor).Post("/labels", api.CreateSpaceLabel)
				r.With(viewer).Get("/milestones", api.ListMilestones)
				r.With(maintainer).Post("/milestones", api.CreateMilestone)
				r.With(viewer).Get("/categories", api.ListCategories)
				r.With(maintainer).Post("/categories", api.CreateCategory)

				r.With(viewer).Get("/boards", api.ListBoards)
				r.With(maintainer).Post("/boards", api.CreateBoard)
				r.With(viewer).Get("/boards/{boardId}", api.GetBoard)

				r.With(viewer).Get("/documents", api.ListDocuments)
				r.With(contributor).Post("/documents", api.CreateDocument)
				r.With(viewer).Get("/requirements", api.ListRequirements)
				r.With(contributor).Post("/requirements", api.CreateRequirement)
				r.With(contributor).Post("/requirements/bulk", api.BulkUpdateRequirements)

				r.With(viewer).Get("/suggest", api.Suggest)
				r.With(viewer).Get("/refs/resolve", api.ResolveRefs)
				r.With(viewer).Post("/uploads", api.UploadStaged)

				r.With(viewer).Get("/views", api.ListSavedViews)
				r.With(viewer).Post("/views", api.CreateSavedView)

				r.With(viewer).Get("/agent-queue", api.AgentQueue)
				r.With(contributor).Post("/agent-queue/claim-next", api.ClaimNext)
			})

			// Boards and taxonomy by id
			r.With(g.Require(authz.Board, authz.Maintainer)).Patch("/boards/{boardId}/columns/{statusId}", api.UpdateBoardColumn)
			r.With(g.Require(authz.Label, authz.Maintainer)).Patch("/labels/{id}", api.UpdateLabel)
			r.With(g.Require(authz.Label, authz.Maintainer)).Delete("/labels/{id}", api.DeleteLabel)
			r.With(g.Require(authz.Milestone, authz.Maintainer)).Patch("/milestones/{id}", api.UpdateMilestone)
			r.With(g.Require(authz.Milestone, authz.Maintainer)).Delete("/milestones/{id}", api.DeleteMilestone)
			r.With(g.Require(authz.Category, authz.Maintainer)).Patch("/categories/{id}", api.UpdateCategory)
			r.With(g.Require(authz.Category, authz.Maintainer)).Delete("/categories/{id}", api.DeleteCategory)
			r.With(g.Require(authz.SavedView, authz.Viewer)).Delete("/views/{id}", api.DeleteSavedView)
			r.With(g.Require(authz.Journal, authz.Viewer)).Patch("/journals/{id}", api.UpdateComment)
			r.With(g.Require(authz.Journal, authz.Viewer)).Delete("/journals/{id}", api.DeleteComment)
			r.With(g.Require(authz.TimeEntry, authz.Contributor)).Delete("/time-entries/{id}", api.DeleteTimeEntry)
			r.With(g.Require(authz.Attachment, authz.Viewer)).Get("/attachments/{id}/url", api.AttachmentURL)
			r.With(g.Require(authz.Attachment, authz.Viewer)).Delete("/uploads/{id}", api.DeleteStaged)
			r.Post("/attachments/sign", api.SignAttachments)

			// Documents (requirements are documents too: every /documents route
			// also has a /requirements alias)
			docRoutes := func(r chi.Router) {
				viewer := g.Require(authz.Document, authz.Viewer)
				contributor := g.Require(authz.Document, authz.Contributor)

				r.With(viewer).Get("/links", api.ListLinks)
				r.With(viewer).Get("/backlinks", api.ListBacklinks)
				r.With(contributor).Post("/links", api.CreateLink)
				r.With(contributor).Delete("/links/{linkId}", api.DeleteLink)

				r.With(viewer).Get("/attachments", api.ListAttachments)
				r.With(contributor).Post("/attachments", api.UploadToDocument)
				r.With(viewer).Delete("/attachments/{attachId}", api.DeleteAttachment)

				r.With(viewer).Get("/labels", api.ListDocumentLabels)
				r.With(contributor).Post("/labels", api.AddDocumentLabel)
				r.With(contributor).Delete("/labels/{labelId}", api.RemoveDocumentLabel)

				r.With(viewer).Get("/journals", api.ListJournals)
				r.With(viewer).Post("/journals", api.CreateComment)
				r.With(viewer).Put("/watch", api.Watch)
				r.With(viewer).Delete("/watch", api.Unwatch)

				r.With(viewer).Get("/history", api.DocumentHistory)
				r.With(viewer).Get("/history/{version}", api.DocumentVersion)
				r.With(contributor).Post("/restore-version", api.RestoreDocumentVersion)
				r.With(contributor).Post("/archive", api.ArchiveDocument)
				r.With(contributor).Post("/restore", api.RestoreDocument)
				r.With(viewer).Get("/export.md", api.ExportDocument)
			}

			r.Route("/documents/{id}", func(r chi.Router) {
				viewer := g.Require(authz.Document, authz.Viewer)
				contributor := g.Require(authz.Document, authz.Contributor)
				r.With(viewer).Get("/", api.GetDocument)
				r.With(contributor).Patch("/", api.UpdateDocument)
				r.With(contributor).Delete("/", api.ArchiveDocument)
				r.With(contributor).Patch("/move", api.MoveDocument)
				r.With(contributor).Post("/promote", api.PromoteDocument)
				r.With(viewer).Put("/favorite", api.FavoriteDocument)
				r.With(viewer).Delete("/favorite", api.UnfavoriteDocument)
				docRoutes(r)
			})

			r.Route("/requirements/{id}", func(r chi.Router) {
				viewer := g.Require(authz.Document, authz.Viewer)
				contributor := g.Require(authz.Document, authz.Contributor)
				maintainer := g.Require(authz.Document, authz.Maintainer)
				r.With(viewer).Get("/", api.GetRequirement)
				r.With(contributor).Patch("/", api.UpdateRequirement)
				r.With(contributor).Delete("/", api.ArchiveDocument)
				r.With(contributor).Post("/transition", api.TransitionRequirement)
				r.With(viewer).Get("/transitions", api.AllowedTransitions)
				r.With(contributor).Patch("/move", api.MoveRequirement)
				r.With(contributor).Patch("/position", api.MoveRequirement)

				r.With(viewer).Get("/members", api.ListRequirementMembers)
				r.With(contributor).Post("/members", api.AddRequirementMember)
				r.With(contributor).Put("/members", api.SetRequirementMembers)
				r.With(contributor).Delete("/members/{userId}", api.RemoveRequirementMember)
				r.With(contributor).Patch("/lead", api.SetRequirementLead)

				r.With(viewer).Get("/readiness", api.Readiness)
				r.With(viewer).Get("/children", api.ListChildren)
				r.With(contributor).Post("/clone", api.CloneRequirement)
				r.With(maintainer).Post("/move-space", api.MoveRequirementToSpace)
				r.With(viewer).Get("/context.md", api.RequirementContext)

				r.With(viewer).Get("/time-entries", api.ListTimeEntries)
				r.With(contributor).Post("/time-entries", api.AddTimeEntry)

				r.With(contributor).Post("/claim", api.ClaimRequirement)
				r.With(contributor).Post("/claim/renew", api.RenewClaim)
				r.With(contributor).Post("/claim/release", api.ReleaseClaim)
				docRoutes(r)
			})
		})
	})

	return r
}
