// Package httpapi 提供 MVP 的三支 REST 端點。
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/shushu010829/notekeel/api/internal/note"
)

// Options 路由設定。
type Options struct {
	AllowedOrigins []string
	Logger         *slog.Logger
}

type handler struct {
	svc    *note.Service
	logger *slog.Logger
}

// NewRouter 組出所有路由與中介層。
func NewRouter(svc *note.Service, opts Options) http.Handler {
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	h := &handler{svc: svc, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/notes", h.createNote)
	mux.HandleFunc("GET /api/notes/search", h.searchNotes)
	mux.HandleFunc("GET /api/notes", h.listNotes)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	return withCORS(opts.AllowedOrigins, mux)
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

	created, err := h.svc.Create(r.Context(), body.Content)
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

	hits, err := h.svc.Search(r.Context(), query, limit)
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
	notes, err := h.svc.List(r.Context(), intParam(r, "limit", 0), intParam(r, "offset", 0))
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
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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
