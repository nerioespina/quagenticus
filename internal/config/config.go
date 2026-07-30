package config

import (
	"github.com/caarlos0/env/v11"
)

type Config struct {
	DatabaseURL string `env:"QG_DATABASE_URL,required"`
	DBSchema    string `env:"QG_DB_SCHEMA" envDefault:"quagenticus"`
	DBMinConns  int32  `env:"QG_DB_MIN_CONNS" envDefault:"5"`
	DBMaxConns  int32  `env:"QG_DB_MAX_CONNS" envDefault:"20"`

	SecretKey      string   `env:"QG_SECRET_KEY,required"`
	AllowedOrigins []string `env:"QG_ALLOWED_ORIGINS" envDefault:"*"`
	Port           int      `env:"PORT" envDefault:"8080"`

	StorageBackend string `env:"QG_STORAGE_BACKEND" envDefault:"fs"`
	StoragePath    string `env:"QG_STORAGE_PATH" envDefault:"./data/attachments"`
}

func Load() (Config, error) {
	var cfg Config
	err := env.Parse(&cfg)
	return cfg, err
}
