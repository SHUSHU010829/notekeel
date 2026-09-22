package auth_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/shushu010829/notekeel/api/internal/auth"
)

const testUserID = "6f1c0b9e-6c2a-4f6b-9a3a-2f1e0d9c8b7a"

type jwksServer struct {
	*httptest.Server
	key      *ecdsa.PrivateKey
	kid      string
	requests int
}

func newJWKSServer(t *testing.T) *jwksServer {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	server := &jwksServer{key: key, kid: "test-kid"}
	server.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		server.requests++
		encode := func(value []byte) string { return base64.RawURLEncoding.EncodeToString(value) }
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[{"kty":"EC","crv":"P-256","kid":"` + server.kid +
			`","x":"` + encode(key.X.Bytes()) + `","y":"` + encode(key.Y.Bytes()) + `"}]}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func (s *jwksServer) sign(t *testing.T, claims jwt.MapClaims, kid string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(s.key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func validClaims(issuer string) jwt.MapClaims {
	return jwt.MapClaims{
		"sub": testUserID,
		"aud": "authenticated",
		"iss": issuer + "/auth/v1",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
}

func TestVerifyAcceptsTokenSignedWithProjectKey(t *testing.T) {
	server := newJWKSServer(t)
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: server.URL})

	userID, err := verifier.Verify(context.Background(), server.sign(t, validClaims(server.URL), server.kid))
	if err != nil {
		t.Fatalf("預期驗證成功，卻得到 %v", err)
	}
	if userID != testUserID {
		t.Errorf("應回傳 sub，得到 %q", userID)
	}
	if !verifier.Enabled() {
		t.Error("設定 Supabase 後應視為啟用驗證")
	}
}

func TestVerifyCachesJWKSBetweenCalls(t *testing.T) {
	server := newJWKSServer(t)
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: server.URL})

	for i := 0; i < 3; i++ {
		if _, err := verifier.Verify(context.Background(), server.sign(t, validClaims(server.URL), server.kid)); err != nil {
			t.Fatalf("第 %d 次驗證失敗：%v", i+1, err)
		}
	}
	if server.requests != 1 {
		t.Errorf("JWKS 應只抓一次，實際 %d 次", server.requests)
	}
}

func TestVerifyRejectsExpiredWrongIssuerAndWrongAudience(t *testing.T) {
	server := newJWKSServer(t)
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: server.URL})

	cases := map[string]func(jwt.MapClaims){
		"過期":     func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() },
		"發行者不符":  func(c jwt.MapClaims) { c["iss"] = "https://someone-else.supabase.co/auth/v1" },
		"對象不符":   func(c jwt.MapClaims) { c["aud"] = "anon" },
		"沒有 sub": func(c jwt.MapClaims) { delete(c, "sub") },
	}

	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			claims := validClaims(server.URL)
			mutate(claims)
			if _, err := verifier.Verify(context.Background(), server.sign(t, claims, server.kid)); !errors.Is(err, auth.ErrInvalidToken) {
				t.Errorf("應回 ErrInvalidToken，得到 %v", err)
			}
		})
	}
}

func TestVerifyRejectsTokenSignedByAnotherKey(t *testing.T) {
	server := newJWKSServer(t)
	other := newJWKSServer(t)
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: server.URL})

	// 用別的專案的私鑰簽，但宣稱是本專案發的
	forged := other.sign(t, validClaims(server.URL), server.kid)
	if _, err := verifier.Verify(context.Background(), forged); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("偽造簽章應被拒絕，得到 %v", err)
	}
}

func TestVerifyRejectsEmptyToken(t *testing.T) {
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: "https://example.supabase.co"})
	if _, err := verifier.Verify(context.Background(), "  "); !errors.Is(err, auth.ErrMissingToken) {
		t.Errorf("應回 ErrMissingToken，得到 %v", err)
	}
}

func TestVerifySupportsLegacyHS256Secret(t *testing.T) {
	const secret = "super-secret-jwt-value"
	const projectURL = "https://legacy.supabase.co"
	verifier := auth.NewSupabase(auth.SupabaseOptions{ProjectURL: projectURL, JWTSecret: secret})

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims(projectURL)).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}

	userID, err := verifier.Verify(context.Background(), signed)
	if err != nil {
		t.Fatalf("舊版對稱金鑰應可驗證，卻得到 %v", err)
	}
	if userID != testUserID {
		t.Errorf("應回傳 sub，得到 %q", userID)
	}

	wrong, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims(projectURL)).SignedString([]byte("wrong-secret"))
	if _, err := verifier.Verify(context.Background(), wrong); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("金鑰不符應被拒絕，得到 %v", err)
	}
}

func TestDevVerifierAlwaysReturnsSameUser(t *testing.T) {
	userID, err := (auth.Dev{}).Verify(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if userID != auth.DevUserID {
		t.Errorf("本機模式應回固定使用者，得到 %q", userID)
	}
	if (auth.Dev{}).Enabled() {
		t.Error("本機模式的 Enabled() 應為 false")
	}
}
