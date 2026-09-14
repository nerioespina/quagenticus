package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/storage"
)

const attachmentColumns = `a.id, a.document_id, a.journal_id, a.space_id, a.filename, a.content_type, a.byte_size,
       a.status, a.is_inline, a.created_at, a.creator_id, u.display_name AS creator_name`

// inlineTypes are rendered by the browser; anything else is forced to download.
var inlineTypes = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true, "image/avif": true,
	"application/pdf": true, "video/mp4": true, "video/webm": true, "audio/mpeg": true, "audio/ogg": true,
	"text/plain": true,
}

func contentDisposition(kind, filename string) string {
	if v := mime.FormatMediaType(kind, map[string]string{"filename": filename}); v != "" {
		return v
	}
	return kind
}

// ListAttachments lists a document's files. ?scope=document excludes files
// attached to comments; ?scope=comments returns only those.
func (a *API) ListAttachments(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	a.array(w, r, `
		SELECT `+attachmentColumns+`
		  FROM attachment a
		  LEFT JOIN app_user u ON u.id = a.creator_id
		  LEFT JOIN journal j ON j.id = a.journal_id
		 WHERE a.document_id = $1 AND a.status = 'attached'
		   AND (j.id IS NULL OR j.deleted_at IS NULL)
		   AND ($2 = '' OR ($2 = 'document' AND a.journal_id IS NULL) OR ($2 = 'comments' AND a.journal_id IS NOT NULL))
		 ORDER BY a.created_at DESC`, chi.URLParam(r, "id"), scope)
}

type uploadedFile struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	ByteSize    int64  `json:"byte_size"`
	URL         string `json:"url"`
}

// UploadToDocument attaches files directly to an existing document.
func (a *API) UploadToDocument(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	docID := chi.URLParam(r, "id")
	files, err := a.receiveFiles(w, r, acc.SpaceID, &docID, "attached")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusCreated, files)
}

// UploadStaged stores files for a requirement or comment still being written.
// ?document_id binds them to an existing document (comments).
func (a *API) UploadStaged(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	var docID *string
	if id := r.URL.Query().Get("document_id"); id != "" {
		if !httpx.IsUUID(id) {
			httpx.RespondError(w, httpx.ErrNotFound)
			return
		}
		var ok bool
		if err := a.db.Pool.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM document WHERE id = $1 AND space_id = $2)`, id, acc.SpaceID).Scan(&ok); err != nil || !ok {
			httpx.RespondError(w, httpx.ErrNotFound)
			return
		}
		docID = &id
	}
	files, err := a.receiveFiles(w, r, acc.SpaceID, docID, "staged")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondJSON(w, http.StatusCreated, files)
}

type hashingReader struct {
	r    io.Reader
	hash io.Writer
}

func (h hashingReader) Read(p []byte) (int, error) {
	n, err := h.r.Read(p)
	if n > 0 {
		h.hash.Write(p[:n]) //nolint:errcheck
	}
	return n, err
}

// receiveFiles streams every "file" part of a multipart request to storage,
// enforcing size/count limits and sniffing the real content type.
func (a *API) receiveFiles(w http.ResponseWriter, r *http.Request, spaceID string, docID *string, status string) ([]uploadedFile, error) {
	maxFile := int64(a.cfg.UploadMaxMB) << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxFile*int64(a.cfg.UploadMaxFiles)+(1<<20))
	mr, err := r.MultipartReader()
	if err != nil {
		return nil, httpx.BadRequest("se esperaba un formulario multipart con archivos")
	}
	act := actor(r)
	var accountID string
	if err := a.db.Pool.QueryRow(r.Context(), `SELECT account_id FROM space WHERE id = $1`, spaceID).Scan(&accountID); err != nil {
		return nil, err
	}

	var out []uploadedFile
	var storedKeys []string
	cleanup := func() {
		for _, k := range storedKeys {
			a.store.Delete(k) //nolint:errcheck
		}
	}

	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			cleanup()
			return nil, httpx.BadRequest("no se pudo leer el archivo enviado")
		}
		if part.FormName() != "file" || part.FileName() == "" {
			part.Close()
			continue
		}
		if len(out) >= a.cfg.UploadMaxFiles {
			part.Close()
			cleanup()
			return nil, httpx.NewError(http.StatusRequestEntityTooLarge, "too_large",
				fmt.Sprintf("máximo %d archivos por envío", a.cfg.UploadMaxFiles))
		}

		filename := sanitizeFilename(part.FileName())
		head := make([]byte, 512)
		n, _ := io.ReadFull(part, head)
		head = head[:n]
		contentType := http.DetectContentType(head)
		if declared := part.Header.Get("Content-Type"); declared != "" && strings.HasPrefix(contentType, "text/plain") {
			// sniffing cannot tell markdown/csv/json apart; keep the declared text type
			if mt, _, err := mime.ParseMediaType(declared); err == nil && (strings.HasPrefix(mt, "text/") || mt == "application/json") {
				contentType = mt
			}
		}

		random := make([]byte, 16)
		rand.Read(random) //nolint:errcheck
		key := fmt.Sprintf("%s/%s/%s%s", accountID, spaceID, hex.EncodeToString(random), strings.ToLower(filepath.Ext(filename)))

		hash := sha256.New()
		size, err := a.store.Put(key, hashingReader{r: io.MultiReader(strings.NewReader(string(head)), part), hash: hash}, maxFile)
		part.Close()
		if errors.Is(err, storage.ErrTooLarge) {
			cleanup()
			return nil, httpx.NewError(http.StatusRequestEntityTooLarge, "too_large",
				fmt.Sprintf("«%s» supera el máximo de %d MB", filename, a.cfg.UploadMaxMB))
		}
		if err != nil {
			cleanup()
			return nil, err
		}
		storedKeys = append(storedKeys, key)

		var id string
		err = a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
			if err := tx.QueryRow(ctx, `
				INSERT INTO attachment (account_id, space_id, document_id, filename, content_type, byte_size,
				                        sha256, storage_key, creator_id, status, staged_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $10 = 'staged' THEN $9::uuid END)
				RETURNING id`,
				accountID, spaceID, docID, filename, contentType, size, hash.Sum(nil), key, act.ID, status).Scan(&id); err != nil {
				return err
			}
			if status == "attached" {
				_, err := tx.Exec(ctx, `SELECT attachment_journal($1, 'attachment_added')`, id)
				return err
			}
			return nil
		})
		if err != nil {
			cleanup()
			return nil, err
		}
		out = append(out, uploadedFile{ID: id, Filename: filename, ContentType: contentType, ByteSize: size, URL: a.signer.URL(id, false)})
	}
	if len(out) == 0 {
		return nil, httpx.BadRequest("no se recibió ningún archivo")
	}
	return out, nil
}

func sanitizeFilename(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '"' || r == '/' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	if len(name) > 200 {
		ext := filepath.Ext(name)
		name = name[:200-len(ext)] + ext
	}
	if name == "" || name == "." {
		name = "archivo"
	}
	return name
}

func (a *API) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	act := actor(r)
	var key string
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		var creator *string
		var status string
		if err := tx.QueryRow(ctx, `SELECT storage_key, creator_id::text, status FROM attachment WHERE id = $1 AND document_id = $2`,
			uuidOrNil(chi.URLParam(r, "attachId")), chi.URLParam(r, "id")).Scan(&key, &creator, &status); err != nil {
			return err
		}
		if acc.Role < authz.Maintainer && (creator == nil || *creator != act.ID) {
			return httpx.NewError(http.StatusForbidden, "forbidden", "solo el autor o un mantenedor puede eliminar el archivo")
		}
		if _, err := tx.Exec(ctx, `SELECT attachment_journal($1, 'attachment_removed')`, chi.URLParam(r, "attachId")); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM attachment WHERE id = $1`, chi.URLParam(r, "attachId"))
		return err
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.store.Delete(key) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// DeleteStaged removes an unused staged upload of the actor.
func (a *API) DeleteStaged(w http.ResponseWriter, r *http.Request) {
	act := actor(r)
	var key string
	err := a.db.Pool.QueryRow(r.Context(), `
		DELETE FROM attachment WHERE id = $1 AND status = 'staged' AND staged_by = $2 RETURNING storage_key`,
		uuidOrNil(chi.URLParam(r, "id")), act.ID).Scan(&key)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.store.Delete(key) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// AttachmentURL returns a short-lived signed URL (guarded by space access).
func (a *API) AttachmentURL(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	httpx.RespondJSON(w, http.StatusOK, map[string]string{
		"url":          a.signer.URL(id, false),
		"download_url": a.signer.URL(id, true),
	})
}

type signRequest struct {
	IDs []string `json:"ids" validate:"required,max=200,dive,uuid"`
}

// SignAttachments signs many ids at once for markdown rendering; ids the actor
// cannot read are omitted.
func (a *API) SignAttachments(w http.ResponseWriter, r *http.Request) {
	var in signRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	rows, err := a.db.Pool.Query(r.Context(), `
		SELECT a.id::text, a.filename, a.content_type FROM attachment a JOIN space s ON s.id = a.space_id
		 WHERE a.id = ANY ($1::uuid[]) AND s.account_id = $2
		   AND space_member_role(a.space_id, $3, $4::uuid) IS NOT NULL`, in.IDs, act.AccountID, act.Type, act.ID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()
	out := map[string]map[string]string{}
	for rows.Next() {
		var id, filename, ct string
		if err := rows.Scan(&id, &filename, &ct); err != nil {
			httpx.RespondError(w, err)
			return
		}
		out[id] = map[string]string{"url": a.signer.URL(id, false), "filename": filename, "content_type": ct}
	}
	httpx.RespondJSON(w, http.StatusOK, out)
}

// ServeFile serves a file from a signed URL (no Authorization header needed).
func (a *API) ServeFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	q := r.URL.Query()
	if !httpx.IsUUID(id) || !a.signer.Verify(id, q.Get("exp"), q.Get("sig")) {
		httpx.RespondError(w, httpx.NewError(http.StatusForbidden, "forbidden", "enlace de descarga inválido o expirado"))
		return
	}
	var filename, contentType, key string
	if err := a.db.Pool.QueryRow(r.Context(), `SELECT filename, content_type, storage_key FROM attachment WHERE id = $1`, id).
		Scan(&filename, &contentType, &key); err != nil {
		httpx.RespondError(w, err)
		return
	}
	f, err := a.store.Get(key)
	if err != nil {
		httpx.RespondError(w, httpx.ErrNotFound)
		return
	}
	defer f.Close()

	disposition := "attachment"
	served := "application/octet-stream"
	if inlineTypes[contentType] && q.Get("dl") != "1" {
		disposition = "inline"
		served = contentType
	}
	h := w.Header()
	h.Set("Content-Type", served)
	h.Set("Content-Disposition", contentDisposition(disposition, filename))
	if served != "application/pdf" { // the browser PDF viewer does not run in a sandbox
		h.Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
	}
	h.Set("Cache-Control", "private, max-age=600")
	io.Copy(w, f) //nolint:errcheck
}
