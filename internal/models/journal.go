package models

import (
	"encoding/json"
	"time"
)

type JournalResponse struct {
	ID            string          `json:"id"`
	RequirementID string          `json:"requirement_id"`
	ActorType     string          `json:"actor_type"`
	ActorID       *string         `json:"actor_id"`
	ActorName     string          `json:"actor_name"`
	NotesMD       string          `json:"notes_md"`
	Details       json.RawMessage `json:"details"`
	CreatedAt     time.Time       `json:"created_at"`
}

type CreateJournalRequest struct {
	NotesMD string `json:"notes_md"`
}
