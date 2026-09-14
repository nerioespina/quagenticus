package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nespina/quagenticus/internal/authz"
	"github.com/nespina/quagenticus/internal/httpx"
)

const agentColumns = `ag.id, ag.name, ag.description, ag.model_name, ag.capabilities, ag.status, ag.is_active,
       ag.scopes, ag.api_key_prefix, ag.last_seen_at, ag.created_at, ag.created_by,
       (SELECT display_name FROM app_user WHERE id = ag.created_by) AS created_by_name,
       (SELECT count(*) FROM requirement r WHERE r.claimed_by_agent_id = ag.id) AS active_claims`

func (a *API) ListAgents(w http.ResponseWriter, r *http.Request) {
	a.array(w, r, `SELECT `+agentColumns+` FROM agent ag WHERE ag.account_id = $1 ORDER BY ag.name`, actor(r).AccountID)
}

type agentRequest struct {
	Name        string   `json:"name" validate:"required,max=80"`
	Description string   `json:"description"`
	ModelName   string   `json:"model_name"`
	Scopes      []string `json:"scopes"`
}

func newAgentKey() (key, prefix string) {
	p := make([]byte, 4)
	s := make([]byte, 24)
	rand.Read(p) //nolint:errcheck
	rand.Read(s) //nolint:errcheck
	prefix = hex.EncodeToString(p)
	return "qga_" + prefix + "_" + hex.EncodeToString(s), prefix
}

// CreateAgent returns the API key once; only its bcrypt hash is stored.
func (a *API) CreateAgent(w http.ResponseWriter, r *http.Request) {
	var in agentRequest
	if err := httpx.Decode(r, &in); err != nil {
		httpx.RespondError(w, err)
		return
	}
	act := actor(r)
	key, prefix := newAgentKey()
	var out []byte
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			WITH ag AS (
			    INSERT INTO agent (account_id, name, description, model_name, api_key_hash, api_key_prefix, created_by, scopes)
			    VALUES ($1, btrim($2), nullif($3, ''), nullif($4, ''), crypt($5, gen_salt('bf')), $6, $7,
			            coalesce($8::text[], '{docs:read,docs:write,requirements:read,requirements:write,agent:claim}'))
			    RETURNING *
			)
			SELECT to_jsonb(ag) - 'api_key_hash' || jsonb_build_object('api_key', $5::text) FROM ag`,
			act.AccountID, in.Name, in.Description, in.ModelName, key, prefix, act.ID, in.Scopes).Scan(&out)
	})
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, http.StatusCreated, out)
}

func (a *API) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	in, err := httpx.DecodeObject(r, "name", "description", "model_name", "is_active", "scopes")
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	a.agentCache.Range(func(k, _ any) bool { a.agentCache.Delete(k); return true })
	a.rawJSON(w, r, http.StatusOK, `
		WITH ag AS (
		    UPDATE agent g SET
		        name        = coalesce(nullif(btrim(p->>'name'), ''), g.name),
		        description = CASE WHEN p ? 'description' THEN p->>'description' ELSE g.description END,
		        model_name  = CASE WHEN p ? 'model_name' THEN p->>'model_name' ELSE g.model_name END,
		        is_active   = coalesce((p->>'is_active')::boolean, g.is_active),
		        scopes      = CASE WHEN jsonb_typeof(p->'scopes') = 'array'
		                           THEN ARRAY(SELECT jsonb_array_elements_text(p->'scopes')) ELSE g.scopes END,
		        updated_at  = now()
		      FROM (SELECT $3::jsonb AS p) x
		     WHERE g.id = $1 AND g.account_id = $2
		    RETURNING g.*
		)
		SELECT to_jsonb(ag) - 'api_key_hash' FROM ag`, uuidOrNil(chi.URLParam(r, "id")), actor(r).AccountID, jsonParam(in))
}

func (a *API) RotateAgentKey(w http.ResponseWriter, r *http.Request) {
	key, prefix := newAgentKey()
	a.agentCache.Range(func(k, _ any) bool { a.agentCache.Delete(k); return true })
	a.rawJSON(w, r, http.StatusOK, `
		WITH ag AS (
		    UPDATE agent SET api_key_hash = crypt($3, gen_salt('bf')), api_key_prefix = $4, updated_at = now()
		     WHERE id = $1 AND account_id = $2
		    RETURNING id, name, api_key_prefix
		)
		SELECT to_jsonb(ag) || jsonb_build_object('api_key', $3::text) FROM ag`,
		uuidOrNil(chi.URLParam(r, "id")), actor(r).AccountID, key, prefix)
}

// AgentQueue lists claimable and claimed requirements of a space, by priority.
func (a *API) AgentQueue(w http.ResponseWriter, r *http.Request) {
	acc := authz.From(r.Context())
	a.array(w, r, `
		SELECT `+requirementSummary+`, v.status_is_agent_claimable,
		       (v.claimed_by_agent_id IS NOT NULL AND v.claim_expires_at > now()) AS is_claimed,
		       v.claim_expires_at
		  FROM v_requirement v
		  JOIN tracker t ON t.id = v.tracker_id AND t.is_agent_enabled
		 WHERE v.space_id = $1
		   AND (v.status_is_agent_claimable OR v.claimed_by_agent_id IS NOT NULL)
		 ORDER BY (v.claimed_by_agent_id IS NOT NULL) DESC, v.priority_weight DESC, v.board_position`, acc.SpaceID)
}

type claimRequest struct {
	LeaseMinutes int `json:"lease_minutes" validate:"omitempty,min=1,max=480"`
}

func leaseInterval(minutes int) string {
	if minutes <= 0 {
		minutes = 30
	}
	return strconv.Itoa(minutes) + " minutes"
}

func (a *API) ClaimNext(w http.ResponseWriter, r *http.Request) {
	var in claimRequest
	httpx.Decode(r, &in) //nolint:errcheck // optional body
	acc := authz.From(r.Context())
	var out []byte
	err := a.tx(r, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT to_jsonb(c) FROM agent_claim_next($1, $2::interval) c WHERE c.id IS NOT NULL`,
			acc.SpaceID, leaseInterval(in.LeaseMinutes)).Scan(&out)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		httpx.RespondError(w, err)
		return
	}
	httpx.RespondRawJSON(w, http.StatusOK, out)
}

func (a *API) ClaimRequirement(w http.ResponseWriter, r *http.Request) {
	var in claimRequest
	httpx.Decode(r, &in) //nolint:errcheck
	a.rawJSON(w, r, http.StatusOK, `SELECT to_jsonb(c) FROM agent_claim($1, $2::interval) c`,
		chi.URLParam(r, "id"), leaseInterval(in.LeaseMinutes))
}

func (a *API) RenewClaim(w http.ResponseWriter, r *http.Request) {
	var in claimRequest
	httpx.Decode(r, &in) //nolint:errcheck
	a.rawJSON(w, r, http.StatusOK, `SELECT jsonb_build_object('expires_at', agent_claim_renew($1, $2::interval))`,
		chi.URLParam(r, "id"), leaseInterval(in.LeaseMinutes))
}

type releaseRequest struct {
	State   string `json:"state" validate:"omitempty,oneof=resolved failed abandoned"`
	Comment string `json:"comment"`
}

func (a *API) ReleaseClaim(w http.ResponseWriter, r *http.Request) {
	var in releaseRequest
	httpx.Decode(r, &in) //nolint:errcheck
	if in.State == "" {
		in.State = "abandoned"
	}
	a.exec(w, r, `SELECT agent_release($1, $2, nullif($3, ''))`, chi.URLParam(r, "id"), in.State, in.Comment)
}
