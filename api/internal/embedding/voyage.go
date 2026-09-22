package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultVoyageBaseURL = "https://api.voyageai.com"

// Voyage 呼叫 Voyage AI 的 embeddings API。
type Voyage struct {
	APIKey     string
	Model      string
	Dims       int
	BaseURL    string
	HTTPClient *http.Client
	MaxRetries int
}

// VoyageOptions 建立 Voyage client 所需的設定。
type VoyageOptions struct {
	APIKey  string
	Model   string
	Dims    int
	BaseURL string
	Timeout time.Duration
}

// NewVoyage 依設定建立 client，未指定的欄位採用預設值。
func NewVoyage(opts VoyageOptions) *Voyage {
	baseURL := strings.TrimSuffix(opts.BaseURL, "/")
	if baseURL == "" {
		baseURL = defaultVoyageBaseURL
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 20 * time.Second
	}
	return &Voyage{
		APIKey:     opts.APIKey,
		Model:      opts.Model,
		Dims:       opts.Dims,
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: timeout},
		MaxRetries: 2,
	}
}

func (v *Voyage) Dimensions() int { return v.Dims }

type voyageRequest struct {
	Model           string   `json:"model"`
	Input           []string `json:"input"`
	InputType       string   `json:"input_type"`
	OutputDimension int      `json:"output_dimension,omitempty"`
}

type voyageResponse struct {
	Data []struct {
		Index     int       `json:"index"`
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
	Detail string `json:"detail"`
}

// Embed 一次送出多段文字，回傳與輸入同順序的向量。
func (v *Voyage) Embed(ctx context.Context, texts []string, inputType InputType) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	payload, err := json.Marshal(voyageRequest{
		Model:           v.Model,
		Input:           texts,
		InputType:       string(inputType),
		OutputDimension: v.Dims,
	})
	if err != nil {
		return nil, fmt.Errorf("編碼 Voyage 請求失敗：%w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= v.MaxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 500 * time.Millisecond):
			}
		}

		vectors, retryable, err := v.embedOnce(ctx, payload, len(texts))
		if err == nil {
			return vectors, nil
		}
		lastErr = err
		if !retryable {
			return nil, err
		}
	}
	return nil, lastErr
}

func (v *Voyage) embedOnce(ctx context.Context, payload []byte, want int) (vectors [][]float32, retryable bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.BaseURL+"/v1/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+v.APIKey)

	resp, err := v.HTTPClient.Do(req)
	if err != nil {
		return nil, true, fmt.Errorf("呼叫 Voyage 失敗：%w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<22))
	if err != nil {
		return nil, true, fmt.Errorf("讀取 Voyage 回應失敗：%w", err)
	}

	if resp.StatusCode != http.StatusOK {
		retry := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
		return nil, retry, fmt.Errorf("Voyage 回應 %d：%s", resp.StatusCode, snippet(body))
	}

	var parsed voyageResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, false, fmt.Errorf("解析 Voyage 回應失敗：%w", err)
	}
	if len(parsed.Data) != want {
		return nil, false, fmt.Errorf("Voyage 回傳 %d 筆向量，預期 %d 筆", len(parsed.Data), want)
	}

	// data 不保證照順序，依 index 歸位。
	vectors = make([][]float32, want)
	for _, item := range parsed.Data {
		if item.Index < 0 || item.Index >= want {
			return nil, false, fmt.Errorf("Voyage 回傳非預期的 index %d", item.Index)
		}
		vector := item.Embedding
		normalize(vector)
		vectors[item.Index] = vector
	}
	for i, vector := range vectors {
		if len(vector) == 0 {
			return nil, false, fmt.Errorf("Voyage 第 %d 筆沒有向量", i)
		}
	}
	return vectors, false, nil
}

func snippet(body []byte) string {
	const max = 200
	text := strings.TrimSpace(string(body))
	if len(text) > max {
		return text[:max] + "…"
	}
	return text
}
