package store

import (
	"context"
	"embed"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shushu010829/notekeel/api/internal/note"
)

//go:embed all:migrations
var migrationsFS embed.FS

func sqrt(v float64) float64 { return math.Sqrt(v) }

// Postgres 以 PostgreSQL + pgvector 儲存筆記與向量。
type Postgres struct {
	pool *pgxpool.Pool
	dims int
}

// NewPostgres 連上資料庫並確認維度設定與資料表一致。
func NewPostgres(ctx context.Context, databaseURL string, dims int) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("建立連線池失敗：%w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("連線資料庫失敗：%w", err)
	}
	return &Postgres{pool: pool, dims: dims}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

// Migrate 套用 migrations/ 內的 SQL；內容皆為 IF NOT EXISTS，可重複執行。
func (p *Postgres) Migrate(ctx context.Context) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("讀取 migrations 失敗：%w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		content, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("讀取 %s 失敗：%w", entry.Name(), err)
		}
		// 維度寫在 SQL 裡，需與 EMBEDDING_DIMENSIONS 一致。
		sql := strings.ReplaceAll(string(content), "{{DIMENSIONS}}", strconv.Itoa(p.dims))
		if _, err := p.pool.Exec(ctx, sql); err != nil {
			return fmt.Errorf("執行 %s 失敗：%w", entry.Name(), err)
		}
	}
	return nil
}

func (p *Postgres) Create(ctx context.Context, ownerID, content string, vector []float32) (note.Note, error) {
	if len(vector) != p.dims {
		return note.Note{}, fmt.Errorf("向量維度 %d 與資料表設定 %d 不符", len(vector), p.dims)
	}

	var created note.Note
	err := p.pool.QueryRow(ctx,
		`insert into notes (owner_id, content, embedding)
		 values ($1, $2, $3::vector)
		 returning id, content, created_at`,
		ownerID, content, vectorLiteral(vector),
	).Scan(&created.ID, &created.Content, &created.CreatedAt)
	if err != nil {
		return note.Note{}, fmt.Errorf("寫入筆記失敗：%w", err)
	}
	return created, nil
}

func (p *Postgres) Search(ctx context.Context, ownerID string, vector []float32, limit int) ([]note.SearchHit, error) {
	if len(vector) != p.dims {
		return nil, fmt.Errorf("向量維度 %d 與資料表設定 %d 不符", len(vector), p.dims)
	}

	// <=> 是 cosine distance（0 最近），轉成 0–1 的相似度回給前端。
	rows, err := p.pool.Query(ctx,
		`select id, content, created_at, 1 - (embedding <=> $1::vector) as similarity
		   from notes
		  where owner_id = $2
		  order by embedding <=> $1::vector
		  limit $3`,
		vectorLiteral(vector), ownerID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("搜尋筆記失敗：%w", err)
	}
	defer rows.Close()

	hits := make([]note.SearchHit, 0, limit)
	for rows.Next() {
		var hit note.SearchHit
		if err := rows.Scan(&hit.ID, &hit.Content, &hit.CreatedAt, &hit.Similarity); err != nil {
			return nil, fmt.Errorf("讀取搜尋結果失敗：%w", err)
		}
		hits = append(hits, hit)
	}
	return hits, rows.Err()
}

func (p *Postgres) List(ctx context.Context, ownerID string, limit, offset int) ([]note.Note, error) {
	rows, err := p.pool.Query(ctx,
		`select id, content, created_at
		   from notes
		  where owner_id = $1
		  order by created_at desc, id desc
		  limit $2 offset $3`,
		ownerID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("列出筆記失敗：%w", err)
	}
	defer rows.Close()

	notes := make([]note.Note, 0, limit)
	for rows.Next() {
		var item note.Note
		if err := rows.Scan(&item.ID, &item.Content, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("讀取筆記失敗：%w", err)
		}
		notes = append(notes, item)
	}
	return notes, rows.Err()
}

// vectorLiteral 產生 pgvector 認得的文字表示：[0.1,0.2,…]
func vectorLiteral(vector []float32) string {
	var builder strings.Builder
	builder.Grow(len(vector) * 12)
	builder.WriteByte('[')
	for i, v := range vector {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.FormatFloat(float64(v), 'f', -1, 32))
	}
	builder.WriteByte(']')
	return builder.String()
}
