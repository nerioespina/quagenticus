package models

import "time"

type RequirementCreate struct {
	TrackerID   string  `json:"tracker_id"   validate:"required,uuid"`
	Title       string  `json:"title"        validate:"required"`
	BodyMD      string  `json:"body_md"`
	PriorityID  string  `json:"priority_id"  validate:"required,uuid"`
	CategoryID  *string `json:"category_id"  validate:"omitempty,uuid"`
	MilestoneID *string `json:"milestone_id" validate:"omitempty,uuid"`
	ParentID    *string `json:"parent_id"    validate:"omitempty,uuid"`
}

type RequirementUpdate struct {
	Title       *string `json:"title"`
	BodyMD      *string `json:"body_md"`
	PriorityID  *string `json:"priority_id"  validate:"omitempty,uuid"`
	CategoryID  *string `json:"category_id"  validate:"omitempty,uuid"`
	MilestoneID *string `json:"milestone_id" validate:"omitempty,uuid"`
	DueDate     *string `json:"due_date"`
	StartDate   *string `json:"start_date"`
}

type TransitionRequest struct {
	ToStatusID string  `json:"to_status_id" validate:"required,uuid"`
	Comment    *string `json:"comment"`
}

type MemberAdd struct {
	SubjectType string `json:"subject_type" validate:"required,oneof=user agent"`
	SubjectID   string `json:"subject_id"   validate:"required,uuid"`
	IsLead      bool   `json:"is_lead"`
}

type RequirementResponse struct {
	DocumentID      string    `json:"id"`
	SpaceID         string    `json:"space_id"`
	AccountID       string    `json:"account_id"`
	RefKey          string    `json:"ref_key"`
	Title           string    `json:"title"`
	BodyMD          string    `json:"body_md"`
	TrackerID       string    `json:"tracker_id"`
	StatusID        string    `json:"status_id"`
	PriorityID      string    `json:"priority_id"`
	CategoryID      *string   `json:"category_id"`
	MilestoneID     *string   `json:"milestone_id"`
	ReporterID      string    `json:"reporter_id"`
	LeadUserID      *string   `json:"lead_user_id"`
	BoardPosition   float64   `json:"board_position"`
	ReadinessScore  *int      `json:"readiness_score"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type ReadinessResponse struct {
	Score  int                    `json:"score"`
	Report map[string]interface{} `json:"report"`
}

type PositionUpdate struct {
	Before *string `json:"before_id" validate:"omitempty,uuid"`
	After  *string `json:"after_id"  validate:"omitempty,uuid"`
}
