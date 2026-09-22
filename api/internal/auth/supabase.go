package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Supabase 驗證 Supabase Auth 簽發的 JWT。
//
// 新專案用非對稱金鑰（ES256／RS256），公鑰放在 JWKS 端點；
// 舊專案用對稱金鑰（HS256）與 JWT secret。兩種都支援。
type Supabase struct {
	issuer   string
	audience string
	jwksURL  string
	secret   []byte

	httpClient *http.Client

	mu        sync.RWMutex
	keys      map[string]crypto.PublicKey
	fetchedAt time.Time
}

// SupabaseOptions 建立驗證器所需的設定。
type SupabaseOptions struct {
	// ProjectURL 例：https://xxxx.supabase.co
	ProjectURL string
	// JWTSecret 舊版對稱金鑰；有非對稱金鑰時可留空。
	JWTSecret string
	Audience  string
	Timeout   time.Duration
}

// NewSupabase 依設定建立驗證器。
func NewSupabase(opts SupabaseOptions) *Supabase {
	projectURL := strings.TrimSuffix(opts.ProjectURL, "/")
	audience := opts.Audience
	if audience == "" {
		audience = "authenticated"
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 10 * time.Second
	}

	return &Supabase{
		issuer:     projectURL + "/auth/v1",
		audience:   audience,
		jwksURL:    projectURL + "/auth/v1/.well-known/jwks.json",
		secret:     []byte(opts.JWTSecret),
		httpClient: &http.Client{Timeout: timeout},
		keys:       map[string]crypto.PublicKey{},
	}
}

func (s *Supabase) Enabled() bool { return true }

// Verify 檢查簽章、發行者、對象與有效期限，回傳 sub（auth.users.id）。
func (s *Supabase) Verify(ctx context.Context, token string) (string, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return "", ErrMissingToken
	}

	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) { return s.keyFor(ctx, t) },
		jwt.WithIssuer(s.issuer),
		jwt.WithAudience(s.audience),
		jwt.WithExpirationRequired(),
		jwt.WithValidMethods([]string{"ES256", "RS256", "HS256"}),
	)
	if err != nil || !parsed.Valid {
		return "", ErrInvalidToken
	}

	subject, err := parsed.Claims.GetSubject()
	if err != nil || subject == "" {
		return "", ErrInvalidToken
	}
	return subject, nil
}

func (s *Supabase) keyFor(ctx context.Context, token *jwt.Token) (any, error) {
	if token.Method.Alg() == "HS256" {
		if len(s.secret) == 0 {
			return nil, fmt.Errorf("收到 HS256 權杖但未設定 SUPABASE_JWT_SECRET")
		}
		return s.secret, nil
	}

	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, fmt.Errorf("權杖缺少 kid")
	}

	if key := s.cachedKey(kid); key != nil {
		return key, nil
	}
	// 沒見過的 kid 代表金鑰輪替了，重抓一次（帶冷卻時間，避免被打爆）。
	if err := s.refreshKeys(ctx); err != nil {
		return nil, err
	}
	if key := s.cachedKey(kid); key != nil {
		return key, nil
	}
	return nil, fmt.Errorf("JWKS 找不到 kid %q 對應的公鑰", kid)
}

func (s *Supabase) cachedKey(kid string) crypto.PublicKey {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.keys[kid]
}

const jwksRefreshCooldown = time.Minute

func (s *Supabase) refreshKeys(ctx context.Context) error {
	s.mu.Lock()
	if time.Since(s.fetchedAt) < jwksRefreshCooldown {
		s.mu.Unlock()
		return fmt.Errorf("JWKS 剛更新過，暫不重抓")
	}
	s.fetchedAt = time.Now()
	s.mu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.jwksURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("取得 JWKS 失敗：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS 回應 %d", resp.StatusCode)
	}

	var document struct {
		Keys []jsonWebKey `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&document); err != nil {
		return fmt.Errorf("解析 JWKS 失敗：%w", err)
	}

	keys := make(map[string]crypto.PublicKey, len(document.Keys))
	for _, key := range document.Keys {
		publicKey, err := key.publicKey()
		if err != nil || key.Kid == "" {
			continue // 忽略不認得的金鑰型別，其餘照用
		}
		keys[key.Kid] = publicKey
	}
	if len(keys) == 0 {
		return fmt.Errorf("JWKS 沒有可用的公鑰")
	}

	s.mu.Lock()
	s.keys = keys
	s.mu.Unlock()
	return nil
}

type jsonWebKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (k jsonWebKey) publicKey() (crypto.PublicKey, error) {
	switch k.Kty {
	case "EC":
		curve, err := curveFor(k.Crv)
		if err != nil {
			return nil, err
		}
		x, err := decodeBigInt(k.X)
		if err != nil {
			return nil, err
		}
		y, err := decodeBigInt(k.Y)
		if err != nil {
			return nil, err
		}
		return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
	case "RSA":
		n, err := decodeBigInt(k.N)
		if err != nil {
			return nil, err
		}
		exponent, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			return nil, err
		}
		padded := make([]byte, 8)
		copy(padded[8-len(exponent):], exponent)
		return &rsa.PublicKey{N: n, E: int(binary.BigEndian.Uint64(padded))}, nil
	default:
		return nil, fmt.Errorf("不支援的金鑰型別 %q", k.Kty)
	}
}

func curveFor(name string) (elliptic.Curve, error) {
	switch name {
	case "P-256":
		return elliptic.P256(), nil
	case "P-384":
		return elliptic.P384(), nil
	case "P-521":
		return elliptic.P521(), nil
	default:
		return nil, fmt.Errorf("不支援的曲線 %q", name)
	}
}

func decodeBigInt(value string) (*big.Int, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(raw), nil
}
