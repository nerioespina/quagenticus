package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/nespina/quagenticus/internal/config"
	"github.com/nespina/quagenticus/internal/db"
	"github.com/nespina/quagenticus/internal/events"
	"github.com/nespina/quagenticus/internal/handlers"
	"github.com/nespina/quagenticus/internal/storage"
)

// Integration tests against a database installed with db/install_database.sh.
//
//	QG_TEST_DATABASE_URL=postgresql://qg:qg@localhost:5499/quagenticus go test ./cmd/quagenticus-api/
func setup(t *testing.T) (*httptest.Server, *db.DB) {
	t.Helper()
	url := os.Getenv("QG_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("QG_TEST_DATABASE_URL not set")
	}
	cfg := config.Config{
		DatabaseURL: url, DBSchema: "quagenticus", DBMinConns: 1, DBMaxConns: 5,
		SecretKey: "test-secret", AllowedOrigins: []string{"*"},
		StoragePath: t.TempDir(), UploadMaxMB: 1, UploadMaxFiles: 3,
	}
	database, err := db.New(context.Background(), cfg)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	api := handlers.New(database, cfg, storage.NewLocal(cfg.StoragePath))
	srv := httptest.NewServer(Router(api, events.NewHub(database.Pool), cfg))
	t.Cleanup(func() { srv.Close(); database.Pool.Close() })
	return srv, database
}

type client struct {
	t     *testing.T
	base  string
	token string
}

func (c *client) do(method, path string, body any, want int) map[string]any {
	c.t.Helper()
	raw := c.raw(method, path, body, want)
	if len(raw) == 0 {
		return nil
	}
	var out map[string]any
	if raw[0] == '[' {
		var arr []any
		json.Unmarshal(raw, &arr) //nolint:errcheck
		return map[string]any{"items": arr}
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		c.t.Fatalf("%s %s: bad json %s", method, path, raw)
	}
	return out
}

func (c *client) raw(method, path string, body any, want int) []byte {
	c.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, want, out)
	}
	return out
}

func login(t *testing.T, base, email, password string) *client {
	c := &client{t: t, base: base}
	out := c.do("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": password}, 200)
	c.token = out["access_token"].(string)
	return c
}

func TestAPIFlow(t *testing.T) {
	srv, database := setup(t)
	ctx := context.Background()
	suffix := fmt.Sprint(time.Now().UnixNano())
	admin := login(t, srv.URL, "admin@demo.local", "admin123")

	// --- spaces and board
	spaces := admin.do("GET", "/api/v1/spaces", nil, 200)["items"].([]any)
	var spaceID string
	for _, s := range spaces {
		if s.(map[string]any)["key"] == "DEMO" {
			spaceID = s.(map[string]any)["id"].(string)
		}
	}
	if spaceID == "" {
		t.Fatal("DEMO space not listed")
	}
	boards := admin.do("GET", "/api/v1/spaces/"+spaceID+"/boards", nil, 200)["items"].([]any)
	boardID := boards[0].(map[string]any)["id"].(string)
	statuses := admin.do("GET", "/api/v1/catalogs/statuses", nil, 200)["items"].([]any)
	board := admin.do("GET", "/api/v1/spaces/"+spaceID+"/boards/"+boardID, nil, 200)
	if got := len(board["columns"].([]any)); got != len(statuses) {
		t.Fatalf("board has %d columns, want one per status (%d)", got, len(statuses))
	}
	statusByKey := map[string]string{}
	for _, s := range statuses {
		m := s.(map[string]any)
		statusByKey[m["key"].(string)] = m["id"].(string)
	}
	trackers := admin.do("GET", "/api/v1/catalogs/trackers", nil, 200)["items"].([]any)
	trackerID := trackers[0].(map[string]any)["id"].(string)

	// --- users and roles
	email := "viewer" + suffix + "@demo.local"
	user := admin.do("POST", "/api/v1/users", map[string]any{"email": email, "password": "secret123", "display_name": "Vera Viewer"}, 201)
	userID := user["id"].(string)
	vera := login(t, srv.URL, email, "secret123")
	vera.do("POST", "/api/v1/users", map[string]any{"email": "x" + email, "password": "secret123", "display_name": "X"}, 403)
	vera.do("GET", "/api/v1/spaces/"+spaceID, nil, 404)
	admin.do("POST", "/api/v1/spaces/"+spaceID+"/members", map[string]any{"user_id": userID, "role": "viewer"}, 204)
	vera.do("GET", "/api/v1/spaces/"+spaceID, nil, 200)
	vera.do("POST", "/api/v1/spaces/"+spaceID+"/requirements", map[string]any{"tracker_id": trackerID, "title": "No"}, 403)

	// --- tenant isolation
	var otherSpace, otherDoc string
	err := database.Pool.QueryRow(ctx, `
		WITH acc AS (INSERT INTO account (key, name) VALUES ('other-`+suffix[len(suffix)-8:]+`', 'Other') RETURNING id),
		     sp AS (INSERT INTO space (account_id, key, name) SELECT id, 'DEMO', 'Other demo' FROM acc RETURNING id, account_id),
		     d AS (INSERT INTO document (account_id, space_id, doc_type, title, slug) SELECT account_id, id, 'note', 'Secreto', 'secreto' FROM sp RETURNING id)
		SELECT (SELECT id FROM sp)::text, (SELECT id FROM d)::text`).Scan(&otherSpace, &otherDoc)
	if err != nil {
		t.Fatal(err)
	}
	admin.do("GET", "/api/v1/spaces/"+otherSpace, nil, 404)
	admin.do("GET", "/api/v1/documents/"+otherDoc, nil, 404)
	admin.do("GET", "/api/v1/documents/not-a-uuid", nil, 404)

	// --- create a complete requirement
	req := admin.do("POST", "/api/v1/spaces/"+spaceID+"/requirements", map[string]any{
		"tracker_id": trackerID, "title": "Integración " + suffix,
		"body_md":    "## Situación actual\nAlgo",
		"status_id":  statusByKey["ready"], "member_ids": []string{userID}, "estimated_hours": 3,
	}, 201)
	reqID := req["id"].(string)
	if req["status_id"] != statusByKey["ready"] || req["member_count"].(float64) != 1 {
		t.Fatalf("unexpected requirement: %v", req)
	}
	board = admin.do("GET", "/api/v1/spaces/"+spaceID+"/boards/"+boardID, nil, 200)
	found := false
	for _, col := range board["columns"].([]any) {
		c := col.(map[string]any)
		for _, card := range c["cards"].([]any) {
			if card.(map[string]any)["id"] == reqID && c["status_id"] == statusByKey["ready"] {
				found = true
			}
		}
	}
	if !found {
		t.Fatal("card not in its status column")
	}

	// --- patch clears, version conflict, transition rules
	upd := admin.do("PATCH", "/api/v1/requirements/"+reqID, map[string]any{"estimated_hours": nil}, 200)
	if upd["estimated_hours"] != nil {
		t.Fatal("estimated_hours not cleared")
	}
	admin.do("PATCH", "/api/v1/requirements/"+reqID, map[string]any{"body_md": "x", "version": 0}, 409)
	admin.do("POST", "/api/v1/requirements/"+reqID+"/transition", map[string]any{"to_status_id": statusByKey["resolved"]}, 422)
	history := admin.do("GET", "/api/v1/requirements/"+reqID+"/journals?kind=history", nil, 200)["items"].([]any)
	if len(history) < 2 {
		t.Fatalf("history not recorded: %v", history)
	}

	// --- staged upload adopted by a comment, signed download
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "evil.html")
	fw.Write([]byte("<html><script>alert(1)</script></html>")) //nolint:errcheck
	mw.Close()
	upReq, _ := http.NewRequest("POST", srv.URL+"/api/v1/spaces/"+spaceID+"/uploads?document_id="+reqID, &buf)
	upReq.Header.Set("Content-Type", mw.FormDataContentType())
	upReq.Header.Set("Authorization", "Bearer "+vera.token)
	upRes, err := http.DefaultClient.Do(upReq)
	if err != nil || upRes.StatusCode != 201 {
		body, _ := io.ReadAll(upRes.Body)
		t.Fatalf("upload failed: %v %d %s", err, upRes.StatusCode, body)
	}
	var files []map[string]any
	json.NewDecoder(upRes.Body).Decode(&files) //nolint:errcheck
	upRes.Body.Close()
	attID := files[0]["id"].(string)

	vera.do("POST", "/api/v1/requirements/"+reqID+"/journals", map[string]any{
		"notes_md": "Evidencia para #" + strings.Split(req["ref_key"].(string), "-")[1], "attachment_ids": []string{attID},
	}, 201)
	comments := admin.do("GET", "/api/v1/requirements/"+reqID+"/journals?kind=comment", nil, 200)["items"].([]any)
	last := comments[len(comments)-1].(map[string]any)
	if len(last["attachments"].([]any)) != 1 {
		t.Fatal("attachment not adopted by comment")
	}
	signed := admin.do("GET", "/api/v1/attachments/"+attID+"/url", nil, 200)["url"].(string)
	fileRes, err := http.Get(srv.URL + signed)
	if err != nil || fileRes.StatusCode != 200 {
		t.Fatalf("signed download failed: %v", err)
	}
	if ct := fileRes.Header.Get("Content-Type"); ct != "application/octet-stream" || !strings.HasPrefix(fileRes.Header.Get("Content-Disposition"), "attachment") {
		t.Fatalf("html must be served as a download, got %q", ct)
	}
	fileRes.Body.Close()
	if res, _ := http.Get(srv.URL + signed + "x"); res.StatusCode != 403 {
		t.Fatal("tampered signature accepted")
	}

	// --- suggest and resolve
	sug := admin.do("GET", "/api/v1/spaces/"+spaceID+"/suggest?q=Integraci&types=requirement", nil, 200)["items"].([]any)
	if len(sug) == 0 {
		t.Fatal("suggest returned nothing")
	}
	num := strings.Split(req["ref_key"].(string), "-")[1]
	resolved := admin.do("GET", "/api/v1/spaces/"+spaceID+"/refs/resolve?keys="+num, nil, 200)
	if _, ok := resolved["requirements"].(map[string]any)[num]; !ok {
		t.Fatalf("ref %s not resolved: %v", num, resolved)
	}

	// --- move within a column returns the card
	card := admin.do("PATCH", "/api/v1/requirements/"+reqID+"/move", map[string]any{"to_status_id": statusByKey["in_progress"]}, 200)
	if card["status_id"] != statusByKey["in_progress"] {
		t.Fatal("move did not transition")
	}

	// --- members: set several, lead
	admin.do("PUT", "/api/v1/requirements/"+reqID+"/members", map[string]any{"user_ids": []string{userID}, "lead_user_id": userID}, 200)
	full := admin.do("GET", "/api/v1/requirements/"+reqID, nil, 200)
	if full["lead_user_id"] != userID {
		t.Fatal("lead not set")
	}

	// --- notifications for the viewer (member_added at creation)
	count := vera.do("GET", "/api/v1/notifications/count", nil, 200)
	if count["unread"].(float64) < 1 {
		t.Fatal("member was not notified")
	}
}
