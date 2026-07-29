package handlers

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/auth"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
	"github.com/nespina/quagenticus/internal/models"
)

type Attachments struct {
	db        *db.DB
	uploadDir string
}

func NewAttachments(db *db.DB, uploadDir string) *Attachments {
	if uploadDir == "" {
		uploadDir = "/tmp/quagenticus_uploads"
	}
	os.MkdirAll(uploadDir, 0755) //nolint:errcheck
	return &Attachments{db: db, uploadDir: uploadDir}
}

func (h *Attachments) ListByRequirement(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, document_id, filename, content_type, byte_size, storage_key, created_at
		FROM attachment
		WHERE document_id = $1
		ORDER BY created_at DESC
	`, reqID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]models.AttachmentResponse, 0)
	for rows.Next() {
		var a models.AttachmentResponse
		if err := rows.Scan(&a.ID, &a.DocumentID, &a.Filename, &a.ContentType, &a.ByteSize, &a.StorageKey, &a.CreatedAt); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, a)
	}

	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Attachments) Upload(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		http.Error(w, "missing requirement id", http.StatusBadRequest)
		return
	}
	actor := auth.ActorFrom(r.Context())

	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB limit
		http.Error(w, "failed to parse multipart form", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file parameter required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read file data", http.StatusInternalServerError)
		return
	}

	hash := sha256.Sum256(data)
	hashHex := fmt.Sprintf("%x", hash)
	storageKey := filepath.Join(h.uploadDir, hashHex)

	if err := os.WriteFile(storageKey, data, 0644); err != nil {
		http.Error(w, "failed to store file", http.StatusInternalServerError)
		return
	}

	var accountID string
	err = h.db.Pool.QueryRow(r.Context(), `SELECT account_id FROM document WHERE id = $1`, reqID).Scan(&accountID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	var a models.AttachmentResponse
	err = h.db.Pool.QueryRow(r.Context(), `
		INSERT INTO attachment (account_id, document_id, filename, content_type, byte_size, sha256, storage_key, creator_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, document_id, filename, content_type, byte_size, storage_key, created_at
	`, accountID, reqID, header.Filename, contentType, int64(len(data)), hash[:], storageKey, actor.ID).Scan(
		&a.ID, &a.DocumentID, &a.Filename, &a.ContentType, &a.ByteSize, &a.StorageKey, &a.CreatedAt,
	)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	httpx.RespondJSON(w, http.StatusCreated, a)
}

func (h *Attachments) Delete(w http.ResponseWriter, r *http.Request) {
	reqID := chi.URLParam(r, "id")
	attachID := chi.URLParam(r, "attachId")

	_, err := h.db.Pool.Exec(r.Context(), `
		DELETE FROM attachment WHERE id = $1 AND document_id = $2
	`, attachID, reqID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Attachments) Download(w http.ResponseWriter, r *http.Request) {
	attachID := chi.URLParam(r, "id")
	if attachID == "" {
		http.Error(w, "missing attachment id", http.StatusBadRequest)
		return
	}

	var filename, contentType, storageKey string
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT filename, content_type, storage_key
		FROM attachment
		WHERE id = $1
	`, attachID).Scan(&filename, &contentType, &storageKey)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	f, err := os.Open(storageKey)
	if err != nil {
		http.Error(w, "file not found on server", http.StatusNotFound)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", filename))
	io.Copy(w, f) //nolint:errcheck
}

