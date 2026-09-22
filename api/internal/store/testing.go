package store

import "context"

// TruncateNotes 清空 notes 表，僅供測試使用。
func TruncateNotes(ctx context.Context, p *Postgres) error {
	_, err := p.pool.Exec(ctx, "truncate table notes")
	return err
}
