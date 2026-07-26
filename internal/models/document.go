package models

import (
	"time"
)

type DocumentCreate struct {
	SpaceID     string                 `json:"space_id"   validate:"required,uuid"`
	ParentID    *string                `json:"parent_id"  validate:"omitempty,uuid"`
	DocType     string                 `json:"doc_type"   validate:"required,oneof=folder note wiki requirement template"`
	Title       string                 `json:"title"      validate:"required"`
	BodyMD      string                 `json:"body_md"`
	FrontMatter map[string]interface{} `json:"front_matter"`
}

type DocumentUpdate struct {
	Title   *string `json:"title"`
	BodyMD  *string `json:"body_md"`
	Version *int    `json:"version"` // optimistic lock
}

type DocumentResponse struct {
	ID         string    `json:"id"`
	SpaceID    string    `json:"space_id"`
	ParentID   *string   `json:"parent_id"`
	DocType    string    `json:"doc_type"`
	RefKey     *string   `json:"ref_key"`
	Slug       string    `json:"slug"`
	Title      string    `json:"title"`
	BodyMD     string    `json:"body_md"`
	Version    int       `json:"version"`
	IsArchived bool      `json:"is_archived"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
