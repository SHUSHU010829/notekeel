package embedding_test

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/shushu010829/notekeel/api/internal/embedding"
)

func TestVoyageSendsModelAndInputTypeAndOrdersByIndex(t *testing.T) {
	var captured struct {
		Model           string   `json:"model"`
		Input           []string `json:"input"`
		InputType       string   `json:"input_type"`
		OutputDimension int      `json:"output_dimension"`
	}
	var authHeader string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &captured); err != nil {
			t.Errorf("請求不是合法 JSON：%v", err)
		}
		// 故意把順序顛倒，驗證 client 會依 index 歸位。
		_, _ = io.WriteString(w, `{"data":[{"index":1,"embedding":[0,3]},{"index":0,"embedding":[4,0]}]}`)
	}))
	defer server.Close()

	client := embedding.NewVoyage(embedding.VoyageOptions{
		APIKey: "test-key", Model: "voyage-4-lite", Dims: 2, BaseURL: server.URL,
	})

	vectors, err := client.Embed(context.Background(), []string{"第一段", "第二段"}, embedding.Document)
	if err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}

	if authHeader != "Bearer test-key" {
		t.Errorf("Authorization 應帶上金鑰，得到 %q", authHeader)
	}
	if captured.Model != "voyage-4-lite" || captured.InputType != "document" || captured.OutputDimension != 2 {
		t.Errorf("請求內容不符：%+v", captured)
	}
	if len(vectors) != 2 {
		t.Fatalf("應回傳 2 組向量，得到 %d", len(vectors))
	}
	// 回傳向量已 normalize：[4,0] → [1,0]，[0,3] → [0,1]
	if math.Abs(float64(vectors[0][0])-1) > 1e-6 || math.Abs(float64(vectors[1][1])-1) > 1e-6 {
		t.Errorf("向量未正規化：%v", vectors)
	}
}

func TestVoyageRetriesOnServerErrorThenSucceeds(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = io.WriteString(w, `{"detail":"internal"}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[{"index":0,"embedding":[1,0]}]}`)
	}))
	defer server.Close()

	client := embedding.NewVoyage(embedding.VoyageOptions{APIKey: "k", Model: "m", Dims: 2, BaseURL: server.URL})
	if _, err := client.Embed(context.Background(), []string{"內容"}, embedding.Query); err != nil {
		t.Fatalf("重試後應成功，卻得到 %v", err)
	}
	if calls != 2 {
		t.Errorf("應重試一次，實際呼叫 %d 次", calls)
	}
}

func TestVoyageDoesNotRetryOnAuthError(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"detail":"invalid api key"}`)
	}))
	defer server.Close()

	client := embedding.NewVoyage(embedding.VoyageOptions{APIKey: "bad", Model: "m", Dims: 2, BaseURL: server.URL})
	_, err := client.Embed(context.Background(), []string{"內容"}, embedding.Query)
	if err == nil {
		t.Fatal("金鑰錯誤時應回傳錯誤")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Errorf("錯誤訊息應包含狀態碼，得到 %v", err)
	}
	if calls != 1 {
		t.Errorf("401 不應重試，實際呼叫 %d 次", calls)
	}
}

func TestDevEmbedderIsDeterministicAndNormalized(t *testing.T) {
	dev := embedding.NewDev(64)
	first, err := dev.Embed(context.Background(), []string{"隨手記"}, embedding.Document)
	if err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	second, _ := dev.Embed(context.Background(), []string{"隨手記"}, embedding.Query)

	if len(first[0]) != 64 {
		t.Fatalf("維度應為 64，得到 %d", len(first[0]))
	}
	for i := range first[0] {
		if first[0][i] != second[0][i] {
			t.Fatalf("同樣的輸入應產生同樣的向量，第 %d 維不同", i)
		}
	}

	var sum float64
	for _, v := range first[0] {
		sum += float64(v) * float64(v)
	}
	if math.Abs(sum-1) > 1e-5 {
		t.Errorf("向量應已正規化，長度平方為 %v", sum)
	}
}
