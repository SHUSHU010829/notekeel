// Package config 集中處理環境變數。
package config

import (
	"os"
	"strconv"
	"strings"
)

// Config 服務啟動所需的全部設定。
type Config struct {
	Port           string
	DatabaseURL    string
	VoyageAPIKey   string
	VoyageModel    string
	VoyageBaseURL  string
	Dimensions     int
	AllowedOrigins []string
	// MinSimilarity 搜尋結果的相似度下限（0–1）；0 表示全部回傳。
	// 接上真實 Voyage 向量後建議設在 0.4–0.6 之間再依實際體感微調。
	MinSimilarity float64
}

// Load 從環境變數讀取設定，未設定者採用預設值。
func Load() Config {
	return Config{
		Port:           envString("PORT", "8080"),
		DatabaseURL:    envString("DATABASE_URL", ""),
		VoyageAPIKey:   envString("VOYAGE_API_KEY", ""),
		VoyageModel:    envString("VOYAGE_MODEL", "voyage-4-lite"),
		VoyageBaseURL:  envString("VOYAGE_BASE_URL", ""),
		Dimensions:     envInt("EMBEDDING_DIMENSIONS", 512),
		AllowedOrigins: envList("CORS_ALLOWED_ORIGINS", []string{"*"}),
		MinSimilarity:  envFloat("SEARCH_MIN_SIMILARITY", 0),
	}
}

// UsesPostgres 沒設定 DATABASE_URL 時退回記憶體儲存（僅本機開發）。
func (c Config) UsesPostgres() bool { return c.DatabaseURL != "" }

// UsesVoyage 沒設定金鑰時退回本機假 embedder（沒有語意能力）。
func (c Config) UsesVoyage() bool { return c.VoyageAPIKey != "" }

func envString(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envFloat(key string, fallback float64) float64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < 0 || value > 1 {
		return fallback
	}
	return value
}

func envList(key string, fallback []string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			values = append(values, trimmed)
		}
	}
	if len(values) == 0 {
		return fallback
	}
	return values
}
