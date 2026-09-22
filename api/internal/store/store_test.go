package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/shushu010829/notekeel/api/internal/note"
	"github.com/shushu010829/notekeel/api/internal/store"
)

// 兩種實作共用同一組行為測試，確保本機（記憶體）與正式（pgvector）語意一致。
func runStoreContract(t *testing.T, newStore func(t *testing.T) note.Store) {
	t.Helper()
	ctx := context.Background()

	t.Run("搜尋依相似度由高到低排序", func(t *testing.T) {
		s := newStore(t)
		if _, err := s.Create(ctx, "貓咪在曬太陽", []float32{1, 0, 0}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Create(ctx, "會議記錄", []float32{0, 1, 0}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Create(ctx, "貓砂要補貨", []float32{0.8, 0.6, 0}); err != nil {
			t.Fatal(err)
		}

		hits, err := s.Search(ctx, []float32{1, 0, 0}, 2)
		if err != nil {
			t.Fatal(err)
		}
		if len(hits) != 2 {
			t.Fatalf("limit=2 應回 2 筆，得到 %d", len(hits))
		}
		if hits[0].Content != "貓咪在曬太陽" {
			t.Errorf("最相近的應排第一，得到 %q", hits[0].Content)
		}
		if hits[0].Similarity < hits[1].Similarity {
			t.Errorf("相似度應遞減：%v < %v", hits[0].Similarity, hits[1].Similarity)
		}
		if hits[0].Similarity < 0.99 {
			t.Errorf("完全相同的向量相似度應接近 1，得到 %v", hits[0].Similarity)
		}
		if hits[0].ID == "" || hits[0].CreatedAt.IsZero() {
			t.Error("搜尋結果應帶回 id 與建立時間")
		}
	})

	t.Run("列表依時間新到舊並支援分頁", func(t *testing.T) {
		s := newStore(t)
		for _, content := range []string{"第一則", "第二則", "第三則"} {
			if _, err := s.Create(ctx, content, []float32{1, 0, 0}); err != nil {
				t.Fatal(err)
			}
		}

		page, err := s.List(ctx, 2, 0)
		if err != nil {
			t.Fatal(err)
		}
		if len(page) != 2 || page[0].Content != "第三則" {
			t.Fatalf("第一頁應是最新兩則，得到 %+v", page)
		}

		second, err := s.List(ctx, 2, 2)
		if err != nil {
			t.Fatal(err)
		}
		if len(second) != 1 || second[0].Content != "第一則" {
			t.Fatalf("第二頁應剩最舊一則，得到 %+v", second)
		}
	})

	t.Run("沒有資料時搜尋回空集合", func(t *testing.T) {
		s := newStore(t)
		hits, err := s.Search(ctx, []float32{1, 0, 0}, 5)
		if err != nil {
			t.Fatal(err)
		}
		if len(hits) != 0 {
			t.Errorf("應回空集合，得到 %d 筆", len(hits))
		}
	})
}

func TestMemoryStore(t *testing.T) {
	runStoreContract(t, func(t *testing.T) note.Store {
		return store.NewMemory()
	})
}

// TestPostgresStore 需要一個啟用 pgvector 的資料庫，未設定 TEST_DATABASE_URL 時略過。
func TestPostgresStore(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("未設定 TEST_DATABASE_URL，略過 pgvector 整合測試")
	}

	runStoreContract(t, func(t *testing.T) note.Store {
		ctx := context.Background()
		pg, err := store.NewPostgres(ctx, databaseURL, 3)
		if err != nil {
			t.Fatalf("連線資料庫失敗：%v", err)
		}
		t.Cleanup(pg.Close)

		if err := pg.Migrate(ctx); err != nil {
			t.Fatalf("套用 migrations 失敗：%v", err)
		}
		if err := store.TruncateNotes(ctx, pg); err != nil {
			t.Fatalf("清空資料表失敗：%v", err)
		}
		return pg
	})
}
