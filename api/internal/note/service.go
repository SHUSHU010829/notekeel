package note

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/shushu010829/notekeel/api/internal/embedding"
)

// 搜尋與列表的預設／上限值，避免前端傳入異常參數。
const (
	DefaultSearchLimit = 8
	MaxSearchLimit     = 50
	DefaultListLimit   = 50
	MaxListLimit       = 200
)

// Service 串起 embedding 與儲存層，是三支 API 共用的用例層。
type Service struct {
	store    Store
	embedder Embedder
	// minSimilarity 低於此分數的結果不回傳；0 表示不過濾。
	minSimilarity float64
}

func NewService(store Store, embedder Embedder) *Service {
	return &Service{store: store, embedder: embedder}
}

// WithMinSimilarity 設定相似度門檻，用來濾掉「湊數」的結果。
func (s *Service) WithMinSimilarity(min float64) *Service {
	s.minSimilarity = min
	return s
}

// Create 記下一則筆記：先轉成向量，再連同原文寫入資料庫。
func (s *Service) Create(ctx context.Context, content string) (Note, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return Note{}, ErrEmptyContent
	}
	if utf8.RuneCountInString(content) > MaxContentLength {
		return Note{}, ErrContentTooLong
	}

	vectors, err := s.embedder.Embed(ctx, []string{content}, embedding.Document)
	if err != nil {
		return Note{}, fmt.Errorf("轉換向量失敗：%w", err)
	}
	if len(vectors) == 0 || len(vectors[0]) == 0 {
		return Note{}, ErrNoEmbedding
	}

	return s.store.Create(ctx, content, vectors[0])
}

// Search 以語意相似度找回筆記。
func (s *Service) Search(ctx context.Context, query string, limit int) ([]SearchHit, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, ErrEmptyQuery
	}
	limit = clamp(limit, DefaultSearchLimit, MaxSearchLimit)

	vectors, err := s.embedder.Embed(ctx, []string{query}, embedding.Query)
	if err != nil {
		return nil, fmt.Errorf("轉換向量失敗：%w", err)
	}
	if len(vectors) == 0 || len(vectors[0]) == 0 {
		return nil, ErrNoEmbedding
	}

	hits, err := s.store.Search(ctx, vectors[0], limit)
	if err != nil || s.minSimilarity <= 0 {
		return hits, err
	}

	filtered := make([]SearchHit, 0, len(hits))
	for _, hit := range hits {
		if hit.Similarity >= s.minSimilarity {
			filtered = append(filtered, hit)
		}
	}
	return filtered, nil
}

// List 依時間新到舊列出筆記。
func (s *Service) List(ctx context.Context, limit, offset int) ([]Note, error) {
	limit = clamp(limit, DefaultListLimit, MaxListLimit)
	if offset < 0 {
		offset = 0
	}
	return s.store.List(ctx, limit, offset)
}

func clamp(value, fallback, max int) int {
	if value <= 0 {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}
