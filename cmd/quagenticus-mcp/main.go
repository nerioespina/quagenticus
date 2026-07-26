package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	r := chi.NewRouter()
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("mcp-ok"))
	})

	addr := ":8081"
	slog.Info("starting mcp server", "addr", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		slog.Error("mcp server error", "error", err)
		os.Exit(1)
	}
}
