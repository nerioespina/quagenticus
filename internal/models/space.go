package models

import "time"

type SpaceCreate struct {
	Key         string `json:"key"  validate:"required"`
	Name        string `json:"name" validate:"required"`
	Description string `json:"description_md"`
}

type SpaceResponse struct {
	ID          string    `json:"id"`
	AccountID   string    `json:"account_id"`
	Key         string    `json:"key"`
	Name        string    `json:"name"`
	Description string    `json:"description_md"`
	Icon        *string   `json:"icon"`
	Color       *string   `json:"color"`
	IsArchived  bool      `json:"is_archived"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
