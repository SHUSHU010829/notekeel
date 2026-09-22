package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shushu010829/notekeel/api/internal/auth"
	"github.com/shushu010829/notekeel/api/internal/embedding"
	"github.com/shushu010829/notekeel/api/internal/httpapi"
	"github.com/shushu010829/notekeel/api/internal/note"
	"github.com/shushu010829/notekeel/api/internal/store"
)

// 本機模式（沒有 Supabase）：不需要權杖，所有請求視為同一位使用者。
func newTestServer() http.Handler {
	svc := note.NewService(store.NewMemory(), embedding.NewDev(64))
	return httpapi.NewRouter(svc, httpapi.Options{AllowedOrigins: []string{"https://notekeel.vercel.app"}})
}

// 假驗證器：把權杖字串直接當成使用者 id，用來驗證多使用者的隔離。
type tokenAsUser struct{}

func (tokenAsUser) Enabled() bool { return true }

func (tokenAsUser) Verify(_ context.Context, token string) (string, error) {
	if token == "" {
		return "", auth.ErrMissingToken
	}
	if token == "expired" {
		return "", auth.ErrInvalidToken
	}
	return token, nil
}

func newAuthedServer() http.Handler {
	svc := note.NewService(store.NewMemory(), embedding.NewDev(64))
	return httpapi.NewRouter(svc, httpapi.Options{Verifier: tokenAsUser{}})
}

func postAs(t *testing.T, handler http.Handler, token, content string) *httptest.ResponseRecorder {
	t.Helper()
	payload, _ := json.Marshal(map[string]string{"content": content})
	req := httptest.NewRequest(http.MethodPost, "/api/notes", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func getAs(t *testing.T, handler http.Handler, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestRequiresTokenWhenSupabaseAuthEnabled(t *testing.T) {
	handler := newAuthedServer()

	if code := postAs(t, handler, "", "沒有權杖").Code; code != http.StatusUnauthorized {
		t.Errorf("沒帶權杖應回 401，得到 %d", code)
	}
	if code := getAs(t, handler, "", "/api/notes").Code; code != http.StatusUnauthorized {
		t.Errorf("列表沒帶權杖應回 401，得到 %d", code)
	}
	if code := getAs(t, handler, "", "/api/notes/search?q=x").Code; code != http.StatusUnauthorized {
		t.Errorf("搜尋沒帶權杖應回 401，得到 %d", code)
	}
	if code := postAs(t, handler, "expired", "過期權杖").Code; code != http.StatusUnauthorized {
		t.Errorf("權杖無效應回 401，得到 %d", code)
	}
}

func TestNotesAreIsolatedPerUser(t *testing.T) {
	handler := newAuthedServer()
	const aliceToken, bobToken = "alice-user-id", "bob-user-id"

	if code := postAs(t, handler, aliceToken, "Alice 的祕密").Code; code != http.StatusCreated {
		t.Fatalf("Alice 應能新增筆記，得到 %d", code)
	}
	if code := postAs(t, handler, bobToken, "Bob 的購物清單").Code; code != http.StatusCreated {
		t.Fatalf("Bob 應能新增筆記，得到 %d", code)
	}

	var bobList struct {
		Notes []note.Note `json:"notes"`
	}
	if err := json.Unmarshal(getAs(t, handler, bobToken, "/api/notes").Body.Bytes(), &bobList); err != nil {
		t.Fatal(err)
	}
	if len(bobList.Notes) != 1 || bobList.Notes[0].Content != "Bob 的購物清單" {
		t.Fatalf("Bob 只應看到自己的筆記，得到 %+v", bobList.Notes)
	}

	var bobSearch struct {
		Results []note.SearchHit `json:"results"`
	}
	if err := json.Unmarshal(getAs(t, handler, bobToken, "/api/notes/search?q=祕密").Body.Bytes(), &bobSearch); err != nil {
		t.Fatal(err)
	}
	for _, hit := range bobSearch.Results {
		if hit.Content == "Alice 的祕密" {
			t.Fatal("搜尋不應回傳其他使用者的筆記")
		}
	}
}

func post(t *testing.T, handler http.Handler, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func get(t *testing.T, handler http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestCreateThenListAndSearch(t *testing.T) {
	handler := newTestServer()

	created := post(t, handler, "/api/notes", map[string]string{"content": "用 pgvector 做語意搜尋的筆記"})
	if created.Code != http.StatusCreated {
		t.Fatalf("新增筆記應回 201，得到 %d：%s", created.Code, created.Body.String())
	}
	var createdNote note.Note
	if err := json.Unmarshal(created.Body.Bytes(), &createdNote); err != nil {
		t.Fatalf("回應不是合法 JSON：%v", err)
	}
	if createdNote.ID == "" || createdNote.CreatedAt.IsZero() {
		t.Errorf("回應應包含 id 與建立時間，得到 %+v", createdNote)
	}

	listed := get(t, handler, "/api/notes")
	if listed.Code != http.StatusOK {
		t.Fatalf("列表應回 200，得到 %d", listed.Code)
	}
	var list struct {
		Notes []note.Note `json:"notes"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Notes) != 1 || list.Notes[0].ID != createdNote.ID {
		t.Errorf("列表應包含剛才那則，得到 %+v", list.Notes)
	}

	searched := get(t, handler, "/api/notes/search?q=語意搜尋&limit=3")
	if searched.Code != http.StatusOK {
		t.Fatalf("搜尋應回 200，得到 %d", searched.Code)
	}
	var results struct {
		Query   string           `json:"query"`
		Results []note.SearchHit `json:"results"`
	}
	if err := json.Unmarshal(searched.Body.Bytes(), &results); err != nil {
		t.Fatal(err)
	}
	if results.Query != "語意搜尋" {
		t.Errorf("回應應帶回查詢字串，得到 %q", results.Query)
	}
	if len(results.Results) != 1 || results.Results[0].ID != createdNote.ID {
		t.Fatalf("應找回剛才那則筆記，得到 %+v", results.Results)
	}
	if results.Results[0].Similarity <= 0 {
		t.Errorf("應回傳相似度，得到 %v", results.Results[0].Similarity)
	}
}

func TestCreateRejectsEmptyContent(t *testing.T) {
	handler := newTestServer()
	response := post(t, handler, "/api/notes", map[string]string{"content": "   "})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("空內容應回 400，得到 %d", response.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["error"] == "" {
		t.Error("錯誤回應應帶可顯示的訊息")
	}
}

func TestCreateRejectsMalformedJSON(t *testing.T) {
	handler := newTestServer()
	req := httptest.NewRequest(http.MethodPost, "/api/notes", bytes.NewReader([]byte("{not json")))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("格式錯誤應回 400，得到 %d", recorder.Code)
	}
}

func TestSearchRequiresQuery(t *testing.T) {
	handler := newTestServer()
	if code := get(t, handler, "/api/notes/search").Code; code != http.StatusBadRequest {
		t.Fatalf("缺少 q 應回 400，得到 %d", code)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	handler := newTestServer()
	req := httptest.NewRequest(http.MethodDelete, "/api/notes", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("不支援的方法應回 405，得到 %d", recorder.Code)
	}
}

func TestCORSAllowsConfiguredOriginAndPreflight(t *testing.T) {
	handler := newTestServer()

	req := httptest.NewRequest(http.MethodOptions, "/api/notes", nil)
	req.Header.Set("Origin", "https://notekeel.vercel.app")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("preflight 應回 204，得到 %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://notekeel.vercel.app" {
		t.Errorf("應允許設定的來源，得到 %q", got)
	}

	other := httptest.NewRequest(http.MethodGet, "/api/notes", nil)
	other.Header.Set("Origin", "https://evil.example")
	otherRecorder := httptest.NewRecorder()
	handler.ServeHTTP(otherRecorder, other)
	if got := otherRecorder.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("未列入清單的來源不應取得 CORS 標頭，得到 %q", got)
	}
}

func TestHealthz(t *testing.T) {
	if code := get(t, newTestServer(), "/healthz").Code; code != http.StatusOK {
		t.Fatalf("健康檢查應回 200，得到 %d", code)
	}
}
