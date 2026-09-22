// Package auth 驗證 Supabase 簽發的存取權杖，取出使用者 id。
// notekeel 與 taskeel 共用同一個 Supabase 專案，因此同一組 auth.users
// 在兩邊都是同一個人。
package auth

import (
	"context"
	"errors"
)

// DevUserID 未設定 Supabase 時的單一使用者，讓本機開發不必登入。
const DevUserID = "00000000-0000-0000-0000-000000000000"

var (
	ErrMissingToken = errors.New("缺少存取權杖")
	ErrInvalidToken = errors.New("存取權杖無效或已過期")
)

// Verifier 把 Bearer token 換成使用者 id。
type Verifier interface {
	// Verify 回傳 auth.users.id（JWT 的 sub）。
	Verify(ctx context.Context, token string) (string, error)
	// Enabled 為 false 代表目前是免登入的本機模式。
	Enabled() bool
}

// Dev 不做任何驗證，一律視為同一位使用者。僅供本機開發。
type Dev struct{}

func (Dev) Verify(context.Context, string) (string, error) { return DevUserID, nil }
func (Dev) Enabled() bool                                  { return false }
