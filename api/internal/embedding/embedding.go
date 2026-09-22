// Package embedding 把文字轉成向量。
package embedding

import (
	"context"
	"math"
)

// InputType Voyage 會依用途調整向量：存檔用 document、查詢用 query。
type InputType string

const (
	Document InputType = "document"
	Query    InputType = "query"
)

// Embedder 所有 embedding 來源的共同介面。
type Embedder interface {
	Embed(ctx context.Context, texts []string, inputType InputType) ([][]float32, error)
	Dimensions() int
}

// normalize 就地做 L2 normalize，讓 cosine 相似度等同內積。
func normalize(vector []float32) {
	var sum float64
	for _, v := range vector {
		sum += float64(v) * float64(v)
	}
	if sum == 0 {
		return
	}
	inv := float32(1 / math.Sqrt(sum))
	for i := range vector {
		vector[i] *= inv
	}
}
