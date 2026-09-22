// Package httpapi 提供 MVP 的三支 REST 端點。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shushu010829/notekeel/api/internal/auth"
	"github.com/shushu010829/notekeel/api/internal/note"
)

// Options 路由設定。
type Options struct {
	AllowedOrigins []string
	Logger         *slog.Logger
	// Verifier 驗證 Supabase 權杖；未指定時視為免登入的本機模式。
	Verifier auth.Verifier
}

type handler struct {
	svc      *note.Service
	logger   *slog.Logger
	verifier auth.Verifier
}

// ownerKey 從 middleware 傳遞已驗證的使用者 id。
type ownerKey struct{}

func ownerFrom(ctx context.Context) string {
	owner, _ := ctx.Value(ownerKey{}).(string)
	return owner
}

// NewRouter 組出所有路由與中介層。
func NewRouter(svc *note.Service, opts Options) http.Handler {
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	verifier := opts.Verifier
	if verifier == nil {
		verifier = auth.Dev{}
	}
	h := &handler{svc: svc, logger: logger, verifier: verifier}

	mux := http.NewServeMux()
	mux.Handle("POST /api/notes", h.authenticated(h.createNote))
	mux.Handle("GET /api/notes/search", h.authenticated(h.searchNotes))
	mux.Handle("GET /api/notes", h.authenticated(h.listNotes))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	return withCORS(opts.AllowedOrigins, mux)
}

// authenticated 驗證 Authorization: Bearer <supabase access token>，
// 把 auth.users.id 放進 context；本機模式下一律視為同一位使用者。
func (h *handler) authenticated(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" && h.verifier.Enabled() {
			writeError(w, http.StatusUnauthorized, "請先登入")
			return
		}

		ownerID, err := h.verifier.Verify(r.Context(), token)
		if err != nil {
			h.logger.Warn("權杖驗證失敗", "error", err)
			writeError(w, http.StatusUnauthorized, "登入已過期，請重新登入")
			return
		}

		next(w, r.WithContext(context.WithValue(r.Context(), ownerKey{}, ownerID)))
	})
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if len(header) < 7 || !strings.EqualFold(header[:7], "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}

type createNoteRequest struct {
	Content string `json:"content"`
}

func (h *handler) createNote(w http.ResponseWriter, r *http.Request) {
	var body createNoteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "請求格式不正確")
		return
	}

	created, err := h.svc.Create(r.Context(), ownerFrom(r.Context()), body.Content)
	switch {
	case errors.Is(err, note.ErrEmptyContent):
		writeError(w, http.StatusBadRequest, "筆記內容不可為空")
		return
	case errors.Is(err, note.ErrContentTooLong):
		writeError(w, http.StatusBadRequest, "筆記內容過長，請分成多則記錄")
		return
	case err != nil:
		h.logger.Error("建立筆記失敗", "error", err)
		writeError(w, http.StatusBadGateway, "記錄失敗，請稍後再試")
		return
	}

	writeJSON(w, http.StatusCreated, created)
}

type searchResponse struct {
	Query   string           `json:"query"`
	Results []note.SearchHit `json:"results"`
}

func (h *handler) searchNotes(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limit := intParam(r, "limit", 0)

	hits, err := h.svc.Search(r.Context(), ownerFrom(r.Context()), query, limit)
	switch {
	case errors.Is(err, note.ErrEmptyQuery):
		writeError(w, http.StatusBadRequest, "請輸入搜尋關鍵字")
		return
	case err != nil:
		h.logger.Error("搜尋失敗", "error", err)
		writeError(w, http.StatusBadGateway, "搜尋失敗，請稍後再試")
		return
	}

	writeJSON(w, http.StatusOK, searchResponse{Query: strings.TrimSpace(query), Results: hits})
}

type listResponse struct {
	Notes []note.Note `json:"notes"`
}

func (h *handler) listNotes(w http.ResponseWriter, r *http.Request) {
	notes, err := h.svc.List(r.Context(), ownerFrom(r.Context()), intParam(r, "limit", 0), intParam(r, "offset", 0))
	if err != nil {
		h.logger.Error("列出筆記失敗", "error", err)
		writeError(w, http.StatusBadGateway, "讀取筆記失敗，請稍後再試")
		return
	}
	writeJSON(w, http.StatusOK, listResponse{Notes: notes})
}

func intParam(r *http.Request, key string, fallback int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// withCORS 讓部署在 Vercel 的前端可以跨網域呼叫這支 API。
func withCORS(allowed []string, next http.Handler) http.Handler {
	allowAll := len(allowed) == 0
	for _, origin := range allowed {
		if origin == "*" {
			allowAll = true
		}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		switch {
		case allowAll:
			w.Header().Set("Access-Control-Allow-Origin", "*")
		case origin != "" && contains(allowed, origin):
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", strconv.Itoa(int((24 * time.Hour).Seconds())))

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
