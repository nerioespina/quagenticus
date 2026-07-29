package models

import "time"

type AttachmentResponse struct {
	ID          string    `json:"id"`
	DocumentID  string    `json:"document_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	ByteSize    int64     `json:"byte_size"`
	StorageKey  string    `json:"storage_key"`
	CreatedAt   time.Time `json:"created_at"`
}
