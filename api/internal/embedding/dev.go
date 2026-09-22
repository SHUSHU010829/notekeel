package embedding

import (
	"context"
	"hash/fnv"
)

// Dev 是本機開發用的假 embedder：把字元 n-gram 雜湊進固定維度的向量。
// 它只能反映字面重疊，沒有語意能力，正式環境務必設定 VOYAGE_API_KEY。
type Dev struct {
	Dims int
}

func NewDev(dims int) *Dev {
	if dims <= 0 {
		dims = 512
	}
	return &Dev{Dims: dims}
}

func (d *Dev) Dimensions() int { return d.Dims }

func (d *Dev) Embed(_ context.Context, texts []string, _ InputType) ([][]float32, error) {
	vectors := make([][]float32, len(texts))
	for i, text := range texts {
		vectors[i] = d.vectorize(text)
	}
	return vectors, nil
}

func (d *Dev) vectorize(text string) []float32 {
	vector := make([]float32, d.Dims)
	runes := []rune(text)
	for size := 1; size <= 3; size++ {
		for start := 0; start+size <= len(runes); start++ {
			h := fnv.New32a()
			_, _ = h.Write([]byte(string(runes[start : start+size])))
			vector[int(h.Sum32())%d.Dims] += 1
		}
	}
	normalize(vector)
	return vector
}
