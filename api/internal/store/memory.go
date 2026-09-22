// Package store 實作筆記的儲存層：正式環境用 PostgreSQL + pgvector，
// 本機沒有資料庫時可退回記憶體版本。
package store

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/shushu010829/notekeel/api/internal/note"
)

type memoryRecord struct {
	note   note.Note
	vector []float32
}

// Memory 只存在行程記憶體中，重啟即消失，僅供本機開發。
type Memory struct {
	mu      sync.RWMutex
	records []memoryRecord
}

func NewMemory() *Memory { return &Memory{} }

func (m *Memory) Create(_ context.Context, content string, vector []float32) (note.Note, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	created := note.Note{
		ID:        uuid.NewString(),
		Content:   content,
		CreatedAt: time.Now().UTC(),
	}
	stored := make([]float32, len(vector))
	copy(stored, vector)
	m.records = append(m.records, memoryRecord{note: created, vector: stored})
	return created, nil
}

func (m *Memory) Search(_ context.Context, vector []float32, limit int) ([]note.SearchHit, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hits := make([]note.SearchHit, 0, len(m.records))
	for _, record := range m.records {
		hits = append(hits, note.SearchHit{
			Note:       record.note,
			Similarity: cosine(vector, record.vector),
		})
	}
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].Similarity > hits[j].Similarity })
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}

func (m *Memory) List(_ context.Context, limit, offset int) ([]note.Note, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sorted := make([]note.Note, 0, len(m.records))
	for _, record := range m.records {
		sorted = append(sorted, record.note)
	}
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].CreatedAt.After(sorted[j].CreatedAt) })

	if offset >= len(sorted) {
		return []note.Note{}, nil
	}
	sorted = sorted[offset:]
	if len(sorted) > limit {
		sorted = sorted[:limit]
	}
	return sorted, nil
}

func cosine(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (sqrt(normA) * sqrt(normB))
}
