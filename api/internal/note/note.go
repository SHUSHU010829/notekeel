// Package note 定義「一則筆記」的領域模型與用例。
package note

import (
	"context"
	"errors"
	"time"

	"github.com/shushu010829/notekeel/api/internal/embedding"
)

// MaxContentLength 單則筆記的長度上限，避免一次貼入過長內容打爆 embedding 請求。
const MaxContentLength = 20000

var (
	ErrEmptyContent   = errors.New("筆記內容不可為空")
	ErrContentTooLong = errors.New("筆記內容過長")
	ErrEmptyQuery     = errors.New("搜尋關鍵字不可為空")
	ErrNoEmbedding    = errors.New("embedding 服務沒有回傳向量")
)

// Note 一則筆記。
type Note struct {
	ID        string    `json:"id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

// SearchHit 搜尋結果：筆記本體加上與查詢的相似度（0–1，越大越相近）。
type SearchHit struct {
	Note
	Similarity float64 `json:"similarity"`
}

// Store 筆記的儲存層。實作見 internal/store。
type Store interface {
	Create(ctx context.Context, content string, vector []float32) (Note, error)
	Search(ctx context.Context, vector []float32, limit int) ([]SearchHit, error)
	List(ctx context.Context, limit, offset int) ([]Note, error)
}

// Embedder 把文字轉成向量。實作見 internal/embedding。
type Embedder interface {
	Embed(ctx context.Context, texts []string, inputType embedding.InputType) ([][]float32, error)
	Dimensions() int
}
