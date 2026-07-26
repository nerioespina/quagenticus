package auth

type Actor struct {
	Type      string   // "user" | "agent" | "system"
	ID        string   // app_user.id o agent.id
	AccountID string
	Scopes    []string // vacío en sesiones interactivas
	Via       string   // "session" | "api_key" | "oauth" | "system"
}
