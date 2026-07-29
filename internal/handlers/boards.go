package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/httpx"
)

type Boards struct {
	db *db.DB
}

func NewBoards(db *db.DB) *Boards {
	return &Boards{db: db}
}

type boardColumn struct {
	ID       string        `json:"id"`
	Name     string        `json:"name"`
	StatusID *string       `json:"status_id"`
	Ord      int           `json:"ord"`
	WIPLimit *int          `json:"wip_limit"`
	Color    *string       `json:"color"`
	Cards    []boardCard   `json:"cards"`
}

type boardCard struct {
	ID            string    `json:"id"`
	RefKey        *string   `json:"ref_key"`
	Title         string    `json:"title"`
	PriorityID    string    `json:"priority_id"`
	PriorityKey   string    `json:"priority_key"`
	PriorityName  string    `json:"priority_name"`
	LeadUserID    *string   `json:"lead_user_id"`
	BoardPosition float64   `json:"board_position"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type boardResponse struct {
	ID        string        `json:"id"`
	SpaceID   *string       `json:"space_id"`
	Name      string        `json:"name"`
	Columns   []boardColumn `json:"columns"`
}

func (h *Boards) List(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")

	type boardRow struct {
		ID      string  `json:"id"`
		SpaceID *string `json:"space_id"`
		Name    string  `json:"name"`
	}

	rows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, space_id, name FROM board
		WHERE space_id = $1 AND is_active = true
		ORDER BY name
	`, spaceID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer rows.Close()

	list := make([]boardRow, 0)
	for rows.Next() {
		var b boardRow
		if err := rows.Scan(&b.ID, &b.SpaceID, &b.Name); err != nil {
			httpx.RespondError(w, err)
			return
		}
		list = append(list, b)
	}
	httpx.RespondJSON(w, http.StatusOK, list)
}

func (h *Boards) Get(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	boardID := chi.URLParam(r, "boardId")

	var board boardResponse
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT id, space_id, name FROM board WHERE id = $1 AND space_id = $2
	`, boardID, spaceID).Scan(&board.ID, &board.SpaceID, &board.Name)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}

	colRows, err := h.db.Pool.Query(r.Context(), `
		SELECT id, name, status_id, ord, wip_limit, color
		FROM board_column WHERE board_id = $1 ORDER BY ord
	`, boardID)
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	defer colRows.Close()

	columns := make([]boardColumn, 0)
	for colRows.Next() {
		var col boardColumn
		if err := colRows.Scan(
			&col.ID, &col.Name, &col.StatusID, &col.Ord, &col.WIPLimit, &col.Color,
		); err != nil {
			httpx.RespondError(w, err)
			return
		}
		col.Cards = []boardCard{}
		columns = append(columns, col)
	}
	colRows.Close()

	// Load cards per column
	for i, col := range columns {
		if col.StatusID == nil {
			continue
		}
		cardRows, err := h.db.Pool.Query(r.Context(), `
			SELECT r.document_id, d.ref_key, d.title,
			       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
			       r.lead_user_id, r.board_position, r.updated_at
			FROM requirement r
			JOIN document d ON d.id = r.document_id
			JOIN priority pr ON pr.id = r.priority_id
			WHERE r.space_id = $1 AND r.status_id = $2 AND r.closed_at IS NULL
			ORDER BY r.board_position, r.created_at
		`, spaceID, col.StatusID)
		if err != nil {
			httpx.RespondError(w, err)
			return
		}

		for cardRows.Next() {
			var c boardCard
			if err := cardRows.Scan(
				&c.ID, &c.RefKey, &c.Title,
				&c.PriorityID, &c.PriorityKey, &c.PriorityName,
				&c.LeadUserID, &c.BoardPosition, &c.UpdatedAt,
			); err != nil {
				cardRows.Close()
				httpx.RespondError(w, err)
				return
			}
			columns[i].Cards = append(columns[i].Cards, c)
		}
		cardRows.Close()
	}

	board.Columns = columns
	httpx.RespondJSON(w, http.StatusOK, board)
}
