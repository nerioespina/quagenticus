// quagenticus-mcp exposes Quagenticus to AI agents through the Model Context
// Protocol (streamable HTTP transport, JSON responses). Every tool call is
// forwarded to the REST API with the caller's credentials (agent API key
// "qga_..." or a user token), so permissions are enforced by the API.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

const protocolVersion = "2025-06-18"

var (
	apiBase  = strings.TrimRight(envOr("QG_API_BASE_URL", "http://localhost:8080/api/v1"), "/")
	httpc    = &http.Client{Timeout: 30 * time.Second}
	uuidRe   = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)
	refKeyRe = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]{1,9}-[0-9]+$`)
)

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
	run         func(c *caller, args map[string]any) (string, error)
}

func obj(props map[string]any, required ...string) map[string]any {
	s := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func str(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }

var reqArg = str("UUID o clave del requerimiento (p. ej. DEMO-12)")

func tools() []tool {
	return []tool{
		{Name: "list_spaces", Description: "Lista los espacios accesibles con su clave e id.", InputSchema: obj(map[string]any{}),
			run: func(c *caller, _ map[string]any) (string, error) { return c.get("/spaces") }},
		{Name: "search", Description: "Búsqueda de texto completo en requerimientos y documentos.",
			InputSchema: obj(map[string]any{"query": str("Texto a buscar"), "space_id": str("Limitar a un espacio (opcional)")}, "query"),
			run: func(c *caller, a map[string]any) (string, error) {
				q := url.Values{"q": {s(a, "query")}}
				if v := s(a, "space_id"); v != "" {
					q.Set("space_id", v)
				}
				return c.get("/search?" + q.Encode())
			}},
		{Name: "get_requirement", Description: "Devuelve el requerimiento en markdown con metadatos, documentos enlazados, sub-requerimientos y comentarios recientes.",
			InputSchema: obj(map[string]any{"requirement": reqArg}, "requirement"),
			run: func(c *caller, a map[string]any) (string, error) {
				id, err := c.resolve(s(a, "requirement"))
				if err != nil {
					return "", err
				}
				return c.get("/requirements/" + id + "/context.md")
			}},
		{Name: "agent_queue", Description: "Requerimientos listos para ser tomados por agentes en un espacio, por prioridad.",
			InputSchema: obj(map[string]any{"space_id": str("Id del espacio")}, "space_id"),
			run: func(c *caller, a map[string]any) (string, error) { return c.get("/spaces/" + s(a, "space_id") + "/agent-queue") }},
		{Name: "claim_next", Description: "Reclama el siguiente requerimiento disponible del espacio con un lease renovable.",
			InputSchema: obj(map[string]any{"space_id": str("Id del espacio"), "lease_minutes": map[string]any{"type": "integer"}}, "space_id"),
			run: func(c *caller, a map[string]any) (string, error) {
				return c.send("POST", "/spaces/"+s(a, "space_id")+"/agent-queue/claim-next", map[string]any{"lease_minutes": a["lease_minutes"]})
			}},
		{Name: "claim", Description: "Reclama un requerimiento concreto.",
			InputSchema: obj(map[string]any{"requirement": reqArg, "lease_minutes": map[string]any{"type": "integer"}}, "requirement"),
			run: func(c *caller, a map[string]any) (string, error) {
				return c.onRequirement(a, "POST", "/claim", map[string]any{"lease_minutes": a["lease_minutes"]})
			}},
		{Name: "renew_claim", Description: "Renueva el lease de un requerimiento reclamado.",
			InputSchema: obj(map[string]any{"requirement": reqArg, "lease_minutes": map[string]any{"type": "integer"}}, "requirement"),
			run: func(c *caller, a map[string]any) (string, error) {
				return c.onRequirement(a, "POST", "/claim/renew", map[string]any{"lease_minutes": a["lease_minutes"]})
			}},
		{Name: "release_claim", Description: "Libera un reclamo indicando el resultado (resolved, failed, abandoned).",
			InputSchema: obj(map[string]any{"requirement": reqArg, "state": str("resolved | failed | abandoned"), "comment": str("Explicación")}, "requirement"),
			run: func(c *caller, a map[string]any) (string, error) {
				return c.onRequirement(a, "POST", "/claim/release", map[string]any{"state": s(a, "state"), "comment": s(a, "comment")})
			}},
		{Name: "create_requirement", Description: "Crea un requerimiento. El cuerpo debería usar las secciones canónicas (Situación actual, Problemas a resolver, Soluciones propuestas, Criterios de aceptación, Consideraciones).",
			InputSchema: obj(map[string]any{
				"space_id": str("Id del espacio"), "title": str("Título"), "body_md": str("Descripción markdown"),
				"tracker_key": str("bug | feature | task ... (opcional)"), "priority_key": str("low | normal | high | urgent (opcional)"),
			}, "space_id", "title"),
			run: func(c *caller, a map[string]any) (string, error) {
				tracker, err := c.catalogID("trackers", s(a, "tracker_key"))
				if err != nil {
					return "", err
				}
				body := map[string]any{"tracker_id": tracker, "title": s(a, "title"), "body_md": s(a, "body_md")}
				if pk := s(a, "priority_key"); pk != "" {
					if body["priority_id"], err = c.catalogID("priorities", pk); err != nil {
						return "", err
					}
				}
				return c.send("POST", "/spaces/"+s(a, "space_id")+"/requirements", body)
			}},
		{Name: "update_requirement", Description: "Actualiza campos (title, body_md, done_ratio, estimated_hours, due_date...). Un campo con null se vacía.",
			InputSchema: obj(map[string]any{"requirement": reqArg, "fields": map[string]any{"type": "object"}}, "requirement", "fields"),
			run: func(c *caller, a map[string]any) (string, error) {
				fields, _ := a["fields"].(map[string]any)
				return c.onRequirement(a, "PATCH", "", fields)
			}},
		{Name: "comment", Description: "Publica un comentario markdown. Admite #123 para referenciar requerimientos y @usuario para mencionar.",
			InputSchema: obj(map[string]any{"requirement": reqArg, "text": str("Comentario markdown")}, "requirement", "text"),
			run: func(c *caller, a map[string]any) (string, error) {
				return c.onRequirement(a, "POST", "/journals", map[string]any{"notes_md": s(a, "text")})
			}},
		{Name: "transition", Description: "Cambia el estado de un requerimiento por clave de estado (p. ej. in_review).",
			InputSchema: obj(map[string]any{"requirement": reqArg, "status_key": str("Clave del estado destino"),
				"comment": str("Comentario (opcional)"), "resolution": str("Resolución si el estado la exige")}, "requirement", "status_key"),
			run: func(c *caller, a map[string]any) (string, error) {
				status, err := c.catalogID("statuses", s(a, "status_key"))
				if err != nil {
					return "", err
				}
				body := map[string]any{"to_status_id": status}
				if v := s(a, "comment"); v != "" {
					body["comment"] = v
				}
				if v := s(a, "resolution"); v != "" {
					body["resolution"] = v
				}
				return c.onRequirement(a, "POST", "/transition", body)
			}},
		{Name: "get_document", Description: "Obtiene un documento (nota/wiki) por id.",
			InputSchema: obj(map[string]any{"id": str("Id del documento")}, "id"),
			run: func(c *caller, a map[string]any) (string, error) { return c.get("/documents/" + s(a, "id")) }},
		{Name: "create_document", Description: "Crea una nota o wiki en markdown. Admite [[Título]] para enlazar otros documentos.",
			InputSchema: obj(map[string]any{"space_id": str("Id del espacio"), "title": str("Título"), "body_md": str("Contenido"),
				"doc_type": str("note | wiki")}, "space_id", "title"),
			run: func(c *caller, a map[string]any) (string, error) {
				dt := s(a, "doc_type")
				if dt == "" {
					dt = "note"
				}
				return c.send("POST", "/spaces/"+s(a, "space_id")+"/documents",
					map[string]any{"title": s(a, "title"), "body_md": s(a, "body_md"), "doc_type": dt})
			}},
	}
}

func s(a map[string]any, k string) string {
	v, _ := a[k].(string)
	return strings.TrimSpace(v)
}

type caller struct {
	auth string
}

func (c *caller) do(method, path string, body any) ([]byte, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, apiBase+path, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", c.auth)
	req.Header.Set("Content-Type", "application/json")
	res, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		var e struct{ Message string }
		json.Unmarshal(out, &e) //nolint:errcheck
		if e.Message == "" {
			e.Message = string(out)
		}
		return nil, fmt.Errorf("API %d: %s", res.StatusCode, e.Message)
	}
	return out, nil
}

func (c *caller) get(path string) (string, error) {
	b, err := c.do("GET", path, nil)
	return string(b), err
}

func (c *caller) send(method, path string, body any) (string, error) {
	b, err := c.do(method, path, body)
	if err == nil && len(b) == 0 {
		return `{"ok":true}`, nil
	}
	return string(b), err
}

func (c *caller) onRequirement(a map[string]any, method, suffix string, body any) (string, error) {
	id, err := c.resolve(s(a, "requirement"))
	if err != nil {
		return "", err
	}
	return c.send(method, "/requirements/"+id+suffix, body)
}

// resolve accepts a UUID or a reference key such as DEMO-12.
func (c *caller) resolve(ref string) (string, error) {
	if uuidRe.MatchString(ref) {
		return ref, nil
	}
	if !refKeyRe.MatchString(ref) {
		return "", fmt.Errorf("referencia inválida: %q", ref)
	}
	b, err := c.do("GET", "/search?types=requirement&limit=5&q="+url.QueryEscape(strings.ToUpper(ref)), nil)
	if err != nil {
		return "", err
	}
	var hits []struct {
		ID     string `json:"id"`
		RefKey string `json:"ref_key"`
	}
	json.Unmarshal(b, &hits) //nolint:errcheck
	for _, h := range hits {
		if strings.EqualFold(h.RefKey, ref) {
			return h.ID, nil
		}
	}
	return "", fmt.Errorf("requerimiento %s no encontrado", ref)
}

func (c *caller) catalogID(catalog, key string) (string, error) {
	b, err := c.do("GET", "/catalogs/"+catalog, nil)
	if err != nil {
		return "", err
	}
	var items []struct {
		ID, Key   string
		IsDefault bool `json:"is_default"`
	}
	json.Unmarshal(b, &items) //nolint:errcheck
	for _, it := range items {
		if (key == "" && it.IsDefault) || strings.EqualFold(it.Key, key) {
			return it.ID, nil
		}
	}
	if key == "" && len(items) > 0 {
		return items[0].ID, nil
	}
	return "", fmt.Errorf("%s: clave %q no existe", catalog, key)
}

func handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "use POST (streamable HTTP, JSON responses)", http.StatusMethodNotAllowed)
		return
	}
	authz := r.Header.Get("Authorization")
	if authz == "" {
		w.Header().Set("WWW-Authenticate", `Bearer realm="quagenticus"`)
		http.Error(w, "Authorization requerido (API key de agente)", http.StatusUnauthorized)
		return
	}
	var req rpcRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&req); err != nil {
		writeRPC(w, rpcResponse{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcError{Code: -32700, Message: "parse error"}})
		return
	}
	if len(req.ID) == 0 { // notification
		w.WriteHeader(http.StatusAccepted)
		return
	}
	resp := rpcResponse{JSONRPC: "2.0", ID: req.ID}
	c := &caller{auth: authz}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]any{
			"protocolVersion": protocolVersion,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo":      map[string]any{"name": "quagenticus", "version": "0.2.0"},
			"instructions":    "Gestión de requerimientos y documentos markdown. Usa agent_queue/claim_next para tomar trabajo, get_requirement para leer el contexto completo, comment y transition para colaborar, y release_claim al terminar.",
		}
	case "ping":
		resp.Result = map[string]any{}
	case "tools/list":
		resp.Result = map[string]any{"tools": tools()}
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		json.Unmarshal(req.Params, &p) //nolint:errcheck
		var found *tool
		for _, t := range tools() {
			if t.Name == p.Name {
				t := t
				found = &t
			}
		}
		if found == nil {
			resp.Error = &rpcError{Code: -32602, Message: "herramienta desconocida: " + p.Name}
			break
		}
		if p.Arguments == nil {
			p.Arguments = map[string]any{}
		}
		text, err := found.run(c, p.Arguments)
		if err != nil {
			resp.Result = map[string]any{"isError": true, "content": []map[string]any{{"type": "text", "text": err.Error()}}}
		} else {
			resp.Result = map[string]any{"content": []map[string]any{{"type": "text", "text": text}}}
		}
	default:
		resp.Error = &rpcError{Code: -32601, Message: "método no soportado: " + req.Method}
	}
	writeRPC(w, resp)
}

func writeRPC(w http.ResponseWriter, resp rpcResponse) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("mcp-ok")) }) //nolint:errcheck
	mux.HandleFunc("/mcp", handle)

	addr := ":" + envOr("PORT", "8081")
	slog.Info("starting mcp server", "addr", addr, "api", apiBase)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("mcp server error", "error", err)
		os.Exit(1)
	}
}
