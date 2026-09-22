package note_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/shushu010829/notekeel/api/internal/embedding"
	"github.com/shushu010829/notekeel/api/internal/note"
)

type fakeEmbedder struct {
	dims       int
	lastInputs []string
	lastType   embedding.InputType
	err        error
}

func (f *fakeEmbedder) Dimensions() int { return f.dims }

func (f *fakeEmbedder) Embed(_ context.Context, texts []string, inputType embedding.InputType) ([][]float32, error) {
	if f.err != nil {
		return nil, f.err
	}
	f.lastInputs = texts
	f.lastType = inputType
	vectors := make([][]float32, len(texts))
	for i := range texts {
		vectors[i] = []float32{1, 0, 0}
	}
	return vectors, nil
}

const owner = "11111111-1111-1111-1111-111111111111"

type fakeStore struct {
	created     []string
	lastOwner   string
	searchLimit int
	listLimit   int
	listOffset  int
}

func (f *fakeStore) Create(_ context.Context, ownerID, content string, _ []float32) (note.Note, error) {
	f.lastOwner = ownerID
	f.created = append(f.created, content)
	return note.Note{ID: "id-1", Content: content, CreatedAt: time.Now()}, nil
}

func (f *fakeStore) Search(_ context.Context, ownerID string, _ []float32, limit int) ([]note.SearchHit, error) {
	f.lastOwner = ownerID
	f.searchLimit = limit
	return nil, nil
}

func (f *fakeStore) List(_ context.Context, ownerID string, limit, offset int) ([]note.Note, error) {
	f.lastOwner = ownerID
	f.listLimit, f.listOffset = limit, offset
	return nil, nil
}

func newService() (*note.Service, *fakeStore, *fakeEmbedder) {
	store := &fakeStore{}
	embedder := &fakeEmbedder{dims: 3}
	return note.NewService(store, embedder), store, embedder
}

func TestCreateTrimsContentAndUsesDocumentInputType(t *testing.T) {
	svc, store, embedder := newService()

	created, err := svc.Create(context.Background(), owner, "  今天想到的點子  ")
	if err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if created.Content != "今天想到的點子" {
		t.Errorf("內容應去掉前後空白，得到 %q", created.Content)
	}
	if len(store.created) != 1 || store.created[0] != "今天想到的點子" {
		t.Errorf("應寫入去空白後的內容，得到 %v", store.created)
	}
	if embedder.lastType != embedding.Document {
		t.Errorf("寫入時 input_type 應為 document，得到 %q", embedder.lastType)
	}
}

func TestCreateRejectsEmptyAndOverlongContent(t *testing.T) {
	svc, _, _ := newService()

	if _, err := svc.Create(context.Background(), owner, "   \n "); !errors.Is(err, note.ErrEmptyContent) {
		t.Errorf("空白內容應回 ErrEmptyContent，得到 %v", err)
	}

	tooLong := strings.Repeat("字", note.MaxContentLength+1)
	if _, err := svc.Create(context.Background(), owner, tooLong); !errors.Is(err, note.ErrContentTooLong) {
		t.Errorf("超長內容應回 ErrContentTooLong，得到 %v", err)
	}
}

func TestCreateSurfacesEmbeddingFailure(t *testing.T) {
	store := &fakeStore{}
	embedder := &fakeEmbedder{dims: 3, err: errors.New("voyage 掛了")}
	svc := note.NewService(store, embedder)

	if _, err := svc.Create(context.Background(), owner, "內容"); err == nil {
		t.Fatal("embedding 失敗時應回傳錯誤")
	}
	if len(store.created) != 0 {
		t.Error("embedding 失敗時不應寫入資料庫")
	}
}

func TestSearchUsesQueryInputTypeAndClampsLimit(t *testing.T) {
	svc, store, embedder := newService()

	if _, err := svc.Search(context.Background(), owner, "點子", 0); err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if embedder.lastType != embedding.Query {
		t.Errorf("搜尋時 input_type 應為 query，得到 %q", embedder.lastType)
	}
	if store.searchLimit != note.DefaultSearchLimit {
		t.Errorf("未指定 limit 應套用預設 %d，得到 %d", note.DefaultSearchLimit, store.searchLimit)
	}

	if _, err := svc.Search(context.Background(), owner, "點子", 9999); err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if store.searchLimit != note.MaxSearchLimit {
		t.Errorf("過大的 limit 應收斂到 %d，得到 %d", note.MaxSearchLimit, store.searchLimit)
	}
}

func TestSearchRejectsEmptyQuery(t *testing.T) {
	svc, _, _ := newService()
	if _, err := svc.Search(context.Background(), owner, "  ", 5); !errors.Is(err, note.ErrEmptyQuery) {
		t.Errorf("空查詢應回 ErrEmptyQuery，得到 %v", err)
	}
}

func TestOwnerIsRequiredAndPassedToStore(t *testing.T) {
	svc, store, _ := newService()

	if _, err := svc.Create(context.Background(), "", "內容"); !errors.Is(err, note.ErrNoOwner) {
		t.Errorf("沒有使用者身分時應回 ErrNoOwner，得到 %v", err)
	}
	if _, err := svc.Search(context.Background(), "", "關鍵字", 5); !errors.Is(err, note.ErrNoOwner) {
		t.Errorf("搜尋沒有使用者身分時應回 ErrNoOwner，得到 %v", err)
	}
	if _, err := svc.List(context.Background(), "", 10, 0); !errors.Is(err, note.ErrNoOwner) {
		t.Errorf("列表沒有使用者身分時應回 ErrNoOwner，得到 %v", err)
	}

	if _, err := svc.Create(context.Background(), owner, "內容"); err != nil {
		t.Fatal(err)
	}
	if store.lastOwner != owner {
		t.Errorf("應把使用者 id 傳給儲存層，得到 %q", store.lastOwner)
	}
}

func TestListClampsLimitAndOffset(t *testing.T) {
	svc, store, _ := newService()

	if _, err := svc.List(context.Background(), owner, 0, -5); err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if store.listLimit != note.DefaultListLimit || store.listOffset != 0 {
		t.Errorf("limit/offset 應為 %d/0，得到 %d/%d", note.DefaultListLimit, store.listLimit, store.listOffset)
	}
}

func TestSearchFiltersOutLowSimilarityHits(t *testing.T) {
	store := &scoredStore{scores: []float64{0.82, 0.55, 0.12, 0}}
	svc := note.NewService(store, &fakeEmbedder{dims: 3}).WithMinSimilarity(0.5)

	hits, err := svc.Search(context.Background(), owner, "向量索引", 10)
	if err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if len(hits) != 2 {
		t.Fatalf("低於門檻的結果應被濾掉，得到 %d 筆", len(hits))
	}
	for _, hit := range hits {
		if hit.Similarity < 0.5 {
			t.Errorf("不應出現低於門檻的結果：%v", hit.Similarity)
		}
	}
}

func TestSearchKeepsEverythingWhenThresholdUnset(t *testing.T) {
	store := &scoredStore{scores: []float64{0.82, 0.12, 0}}
	svc := note.NewService(store, &fakeEmbedder{dims: 3})

	hits, err := svc.Search(context.Background(), owner, "向量索引", 10)
	if err != nil {
		t.Fatalf("預期成功，卻得到 %v", err)
	}
	if len(hits) != 3 {
		t.Fatalf("未設門檻時應全部回傳，得到 %d 筆", len(hits))
	}
}

type scoredStore struct {
	fakeStore
	scores []float64
}

func (s *scoredStore) Search(_ context.Context, _ string, _ []float32, _ int) ([]note.SearchHit, error) {
	hits := make([]note.SearchHit, 0, len(s.scores))
	for i, score := range s.scores {
		hits = append(hits, note.SearchHit{
			Note:       note.Note{ID: string(rune('a' + i)), Content: "內容"},
			Similarity: score,
		})
	}
	return hits, nil
}
