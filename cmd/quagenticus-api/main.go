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
	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/db"
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

	database, err := db.New(context.Background(), cfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer database.Pool.Close()

	authH := handlers.NewAuth(database, cfg.SecretKey)
	docsH := handlers.NewDocuments(database)
	spacesH := handlers.NewSpaces(database)
	reqsH := handlers.NewRequirements(database)
	boardsH := handlers.NewBoards(database)
	journalsH := handlers.NewJournals(database)
	linksH := handlers.NewLinks(database)
	store := storage.NewLocal(cfg.StoragePath)
	attachmentsH := handlers.NewAttachments(database, store)
	milestonesH := handlers.NewMilestones(database)
	categoriesH := handlers.NewCategories(database)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httpx.CORS(cfg.AllowedOrigins))
	r.Use(auth.Authenticate(cfg.SecretKey))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok")) //nolint:errcheck
	})

	r.Route("/api/v1", func(r chi.Router) {
		// Public
		r.Post("/auth/login", authH.Login)

		// Protected
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth)

			r.Get("/auth/me", authH.Me)

			// Spaces
			r.Get("/spaces", spacesH.List)
			r.Post("/spaces", spacesH.Create)
			r.Get("/spaces/{spaceId}", spacesH.Get)
			r.Get("/spaces/{spaceId}/members", spacesH.ListMembers)

			// Documents (nested under space)
			r.Get("/spaces/{spaceId}/documents", docsH.List)
			r.Post("/spaces/{spaceId}/documents", docsH.Create)
			r.Get("/spaces/{spaceId}/boards", boardsH.List)

			// Documents (by id)
			r.Get("/documents/{id}", docsH.Get)
			r.Patch("/documents/{id}", docsH.Update)
			r.Delete("/documents/{id}", docsH.Delete)
			r.Get("/documents/{id}/history", docsH.History)

			// Requirements (nested under space)
			r.Get("/spaces/{spaceId}/requirements", reqsH.List)
			r.Post("/spaces/{spaceId}/requirements", reqsH.Create)

			// Requirements (by id)
			r.Get("/requirements/{id}", reqsH.Get)
			r.Patch("/requirements/{id}", reqsH.Update)
			r.Post("/requirements/{id}/transition", reqsH.Transition)
			r.Post("/requirements/{id}/members", reqsH.AddMember)
			r.Get("/requirements/{id}/members", reqsH.ListMembers)
			r.Delete("/requirements/{id}/members/{userId}", reqsH.RemoveMember)
			r.Patch("/requirements/{id}/lead", reqsH.SetLead)
			r.Get("/requirements/{id}/journals", journalsH.ListByRequirement)
			r.Post("/requirements/{id}/journals", journalsH.Create)
			r.Get("/requirements/{id}/readiness", reqsH.Readiness)
			r.Patch("/requirements/{id}/position", reqsH.UpdatePosition)
			r.Patch("/requirements/{id}/move", reqsH.Move)
			r.Get("/requirements/{id}/links", linksH.ListByRequirement)
			r.Post("/requirements/{id}/links", linksH.Create)
			r.Delete("/requirements/{id}/links/{linkId}", linksH.Delete)
			r.Get("/requirements/{id}/children", reqsH.ListChildren)
			r.Get("/requirements/{id}/labels", reqsH.ListLabels)
			r.Post("/requirements/{id}/labels", reqsH.AddLabel)
			r.Delete("/requirements/{id}/labels/{labelId}", reqsH.RemoveLabel)
			r.Get("/requirements/{id}/attachments", attachmentsH.ListByRequirement)
			r.Post("/requirements/{id}/attachments", attachmentsH.Upload)
			r.Delete("/requirements/{id}/attachments/{attachId}", attachmentsH.Delete)
			r.Get("/attachments/{id}/download", attachmentsH.Download)

			// Boards
			r.Get("/spaces/{spaceId}/boards/{boardId}", boardsH.Get)

			// Milestones
			r.Get("/spaces/{spaceId}/milestones", milestonesH.List)
			r.Post("/spaces/{spaceId}/milestones", milestonesH.Create)
			r.Patch("/milestones/{id}", milestonesH.Update)
			r.Delete("/milestones/{id}", milestonesH.Delete)

			// Categories
			r.Get("/spaces/{spaceId}/categories", categoriesH.List)
			r.Post("/spaces/{spaceId}/categories", categoriesH.Create)
			r.Patch("/categories/{id}", categoriesH.Update)
			r.Delete("/categories/{id}", categoriesH.Delete)

			// Catalogs (read-only lookups for UI selects)
			r.Get("/catalogs/trackers", docsH.Trackers)
			r.Get("/catalogs/priorities", docsH.Priorities)
			r.Get("/catalogs/labels", docsH.Labels)
			r.Get("/catalogs/statuses", docsH.Statuses)
		})
	})

	addr := fmt.Sprintf(":%d", cfg.Port)
	server := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		slog.Info("starting server", "addr", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down server")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("server exited")
}
