package models

import "time"

type DocumentLinkResponse struct {
	ID         string    `json:"id"`
	SourceID   string    `json:"source_id"`
	TargetID   string    `json:"target_id"`
	TargetTitle string   `json:"target_title"`
	TargetSlug string    `json:"target_slug"`
	TargetType string    `json:"target_type"`
	LinkType   string    `json:"link_type"`
	Note       string    `json:"note"`
	CreatedAt  time.Time `json:"created_at"`
}

type CreateDocumentLinkRequest struct {
	TargetID string `json:"target_id"`
	LinkType string `json:"link_type"`
	Note     string `json:"note"`
}
