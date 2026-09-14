package config

import (
	"os"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	DatabaseURL string `env:"QG_DATABASE_URL,required"`
	DBSchema    string `env:"QG_DB_SCHEMA" envDefault:"quagenticus"`
	DBMinConns  int32  `env:"QG_DB_MIN_CONNS" envDefault:"5"`
	DBMaxConns  int32  `env:"QG_DB_MAX_CONNS" envDefault:"20"`

	SecretKey      string   `env:"QG_SECRET_KEY,required"`
	AllowedOrigins []string `env:"QG_ALLOWED_ORIGINS" envDefault:"http://localhost:5173,http://localhost:3000"`
	Port           int      `env:"PORT" envDefault:"8080"`
	// Cookie "Secure" flag for the refresh token. Enable behind HTTPS.
	CookieSecure bool `env:"QG_COOKIE_SECURE" envDefault:"false"`
	// Public base URL of the web app, used in e-mail links.
	PublicURL string `env:"QG_PUBLIC_URL" envDefault:"http://localhost:3000"`

	StorageBackend string `env:"QG_STORAGE_BACKEND" envDefault:"fs"`
	StoragePath    string `env:"QG_STORAGE_PATH" envDefault:"./data/attachments"`

	UploadMaxMB    int `env:"QG_UPLOAD_MAX_MB" envDefault:"25"`
	UploadMaxFiles int `env:"QG_UPLOAD_MAX_FILES" envDefault:"10"`

	SMTPHost string `env:"QG_SMTP_HOST"`
	SMTPPort int    `env:"QG_SMTP_PORT" envDefault:"587"`
	SMTPUser string `env:"QG_SMTP_USER"`
	SMTPPass string `env:"QG_SMTP_PASSWORD"`
	SMTPFrom string `env:"QG_SMTP_FROM" envDefault:"quagenticus@localhost"`
}

func Load() (Config, error) {
	var cfg Config
	err := env.Parse(&cfg)
	return cfg, err
}

// LoadWorker loads the configuration for background processes, which do not
// sign tokens and therefore do not require QG_SECRET_KEY.
func LoadWorker() (Config, error) {
	if os.Getenv("QG_SECRET_KEY") == "" {
		os.Setenv("QG_SECRET_KEY", "unused-by-worker") //nolint:errcheck
	}
	return Load()
}
