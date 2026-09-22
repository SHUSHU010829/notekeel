// Command server 啟動隨手記的 HTTP API。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/shushu010829/notekeel/api/internal/auth"
	"github.com/shushu010829/notekeel/api/internal/config"
	"github.com/shushu010829/notekeel/api/internal/embedding"
	"github.com/shushu010829/notekeel/api/internal/httpapi"
	"github.com/shushu010829/notekeel/api/internal/note"
	"github.com/shushu010829/notekeel/api/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if err := run(logger); err != nil {
		logger.Error("服務結束", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	noteStore, closeStore, err := buildStore(ctx, cfg, logger)
	if err != nil {
		return err
	}
	defer closeStore()

	embedder := buildEmbedder(cfg, logger)
	service := note.NewService(noteStore, embedder).WithMinSimilarity(cfg.MinSimilarity)

	server := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: httpapi.NewRouter(service, httpapi.Options{
			AllowedOrigins: cfg.AllowedOrigins,
			Logger:         logger,
			Verifier:       buildVerifier(cfg, logger),
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("API 啟動", "port", cfg.Port, "model", cfg.VoyageModel, "dimensions", cfg.Dimensions)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("收到結束訊號，準備關閉")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func buildStore(ctx context.Context, cfg config.Config, logger *slog.Logger) (note.Store, func(), error) {
	if !cfg.UsesPostgres() {
		logger.Warn("未設定 DATABASE_URL，改用記憶體儲存（重啟後資料會消失，僅供本機開發）")
		return store.NewMemory(), func() {}, nil
	}

	connectCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	pg, err := store.NewPostgres(connectCtx, cfg.DatabaseURL, cfg.Dimensions)
	if err != nil {
		return nil, nil, err
	}
	if err := pg.Migrate(connectCtx); err != nil {
		pg.Close()
		return nil, nil, err
	}
	logger.Info("已連上 PostgreSQL 並套用 migrations")
	return pg, pg.Close, nil
}

func buildVerifier(cfg config.Config, logger *slog.Logger) auth.Verifier {
	if !cfg.UsesSupabaseAuth() {
		logger.Warn("未設定 SUPABASE_URL，所有請求都視為同一位使用者（僅供本機開發）")
		return auth.Dev{}
	}
	logger.Info("啟用 Supabase 權杖驗證", "project", cfg.SupabaseURL)
	return auth.NewSupabase(auth.SupabaseOptions{
		ProjectURL: cfg.SupabaseURL,
		JWTSecret:  cfg.SupabaseJWTSecret,
	})
}

func buildEmbedder(cfg config.Config, logger *slog.Logger) note.Embedder {
	if !cfg.UsesVoyage() {
		logger.Warn("未設定 VOYAGE_API_KEY，改用本機假 embedder（只比對字面，沒有語意能力）")
		return embedding.NewDev(cfg.Dimensions)
	}
	return embedding.NewVoyage(embedding.VoyageOptions{
		APIKey:  cfg.VoyageAPIKey,
		Model:   cfg.VoyageModel,
		Dims:    cfg.Dimensions,
		BaseURL: cfg.VoyageBaseURL,
	})
}
