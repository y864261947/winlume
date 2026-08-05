package pricing

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/vm"
)

const (
	defaultExpressionVersion = "v1"
	expressionCacheCapacity  = 256
)

var (
	// ErrInvalidExpression is returned for invalid versions, syntax, variables,
	// functions, probes, or unsafe expression outputs.
	ErrInvalidExpression = errors.New("pricing: invalid tiered expression")
	// ErrExpressionHashMismatch rejects a corrupted or unverified frozen rule.
	ErrExpressionHashMismatch = errors.New("pricing: expression hash mismatch")
)

// TokenParams is the complete v1 expression input. Values are float64 because
// expr executes arithmetic in float64; persisted pricing numbers remain decimal.
type TokenParams struct {
	P    float64
	C    float64
	Len  float64
	CR   float64
	CC   float64
	CC1h float64
	Img  float64
	ImgO float64
	AI   float64
	AO   float64
}

// ExpressionInfo is safe metadata returned by validation and compilation.
// Its maps and slices are copies, never cache-owned values.
type ExpressionInfo struct {
	Hash       string
	Version    string
	UsedVars   map[string]bool
	HeaderKeys []string
	ParamPaths []string
}

// ExpressionResult is an expression result before any Task 11 quota
// conversion. CrossedTier is meaningful when evaluated from a frozen snapshot.
type ExpressionResult struct {
	Value       float64
	MatchedTier string
	CrossedTier bool
}

type expressionCacheKey struct {
	version string
	hash    string
}

type compiledExpression struct {
	program    *vm.Program
	expression string
	hash       string
	version    string
	usedVars   map[string]bool
	headerKeys []string
	paramPaths []string
}

type expressionCacheEntry struct {
	key      expressionCacheKey
	compiled *compiledExpression
}

type expressionLRU struct {
	mu      sync.Mutex
	entries map[expressionCacheKey]*list.Element
	order   *list.List
}

var compiledExpressions = expressionLRU{
	entries: make(map[expressionCacheKey]*list.Element),
	order:   list.New(),
}

// ExpressionHash returns a digest of the original expression bytes. Version
// prefixes and whitespace intentionally change the digest.
func ExpressionHash(expression string) string {
	digest := sha256.Sum256([]byte(expression))
	return hex.EncodeToString(digest[:])
}

// ValidateExpression compiles an importer-facing expression and runs stable
// smoke vectors so malformed, negative, or non-finite expressions are
// rejected before a catalog can become active.
func ValidateExpression(expression, expectedHash string) (ExpressionInfo, error) {
	compiled, err := compiledExpressionFor(expression, expectedHash)
	if err != nil {
		return ExpressionInfo{}, err
	}

	probes := emptyProbes(compiled)
	for _, params := range []TokenParams{
		{},
		{P: 1_000, C: 1_000, Len: 1_000},
		{P: 100_000, C: 100_000, Len: 100_000},
		{P: 1_000_000, C: 1_000_000, Len: 1_000_000},
	} {
		if _, err := runCompiled(compiled, params, probes.headers, probes.params, time.Unix(0, 0).UTC()); err != nil {
			return ExpressionInfo{}, fmt.Errorf("%w: validation vector failed: %v", ErrInvalidExpression, err)
		}
	}

	return compiled.info(), nil
}

// FreezeExpression materializes only the header and body probes referenced by
// an expression. It stores no request body and no unreferenced headers.
func FreezeExpression(expression, expectedHash string, estimate TokenParams, request RequestInput) (*ExpressionSnapshot, error) {
	compiled, err := compiledExpressionFor(expression, expectedHash)
	if err != nil {
		return nil, err
	}
	probes := materializeProbes(compiled, request)
	evaluationTime := frozenEvaluationTime(request.EvaluationTime)
	result, err := runCompiled(compiled, estimate, probes.headers, probes.params, evaluationTime)
	if err != nil {
		return nil, err
	}

	return &ExpressionSnapshot{
		Expression:     compiled.expression,
		Hash:           compiled.hash,
		Version:        compiled.version,
		UsedVars:       cloneBoolMap(compiled.usedVars),
		HeaderProbes:   cloneStringMap(probes.headers),
		ParamProbes:    cloneAnyMap(probes.params),
		EstimatedTier:  result.MatchedTier,
		EvaluationTime: evaluationTime,
	}, nil
}

// RunExpression evaluates an expression against a current request. Relay code
// should use FreezeExpression before relay, then RunFrozenExpression later.
func RunExpression(expression, expectedHash string, params TokenParams, request RequestInput) (ExpressionResult, error) {
	compiled, err := compiledExpressionFor(expression, expectedHash)
	if err != nil {
		return ExpressionResult{}, err
	}
	probes := materializeProbes(compiled, request)
	return runCompiled(compiled, params, probes.headers, probes.params, frozenEvaluationTime(request.EvaluationTime))
}

// RunFrozenExpression evaluates only the values embedded in a previous
// ExpressionSnapshot. It neither reads an active catalog nor accepts headers,
// a request body, or the current clock.
func RunFrozenExpression(snapshot *ExpressionSnapshot, params TokenParams) (ExpressionResult, error) {
	if snapshot == nil {
		return ExpressionResult{}, fmt.Errorf("%w: snapshot is required", ErrInvalidExpression)
	}
	if ExpressionHash(snapshot.Expression) != snapshot.Hash {
		return ExpressionResult{}, fmt.Errorf("%w for %q", ErrExpressionHashMismatch, snapshot.Hash)
	}
	version, _, err := parseExpressionVersion(snapshot.Expression)
	if err != nil {
		return ExpressionResult{}, err
	}
	if snapshot.Version != version {
		return ExpressionResult{}, fmt.Errorf("%w: snapshot version %q does not match expression version %q", ErrInvalidExpression, snapshot.Version, version)
	}
	if snapshot.EvaluationTime.IsZero() {
		return ExpressionResult{}, fmt.Errorf("%w: snapshot evaluation time is required", ErrInvalidExpression)
	}

	compiled, err := compiledExpressionFor(snapshot.Expression, snapshot.Hash)
	if err != nil {
		return ExpressionResult{}, err
	}
	result, err := runCompiled(
		compiled,
		params,
		cloneStringMap(snapshot.HeaderProbes),
		cloneAnyMap(snapshot.ParamProbes),
		snapshot.EvaluationTime,
	)
	if err != nil {
		return ExpressionResult{}, err
	}
	result.CrossedTier = result.MatchedTier != snapshot.EstimatedTier
	return result, nil
}

// RoundHalfAwayFromZero uses Go's math.Round semantics for the final tiered
// integer conversion. Task 10 intentionally does not apply quota conversion.
func RoundHalfAwayFromZero(value float64) int64 {
	return int64(math.Round(value))
}

func compiledExpressionFor(expression, expectedHash string) (*compiledExpression, error) {
	version, body, err := parseExpressionVersion(expression)
	if err != nil {
		return nil, err
	}
	hash := ExpressionHash(expression)
	if expectedHash != "" && expectedHash != hash {
		return nil, fmt.Errorf("%w: supplied %q does not match %q", ErrExpressionHashMismatch, expectedHash, hash)
	}
	key := expressionCacheKey{version: version, hash: hash}
	if compiled := compiledExpressions.get(key); compiled != nil {
		return compiled, nil
	}

	program, err := expr.Compile(
		body,
		expr.Env(compileEnvironment()),
		expr.AsFloat64(),
		expr.DisableAllBuiltins(),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: compile: %v", ErrInvalidExpression, err)
	}
	metadata, err := extractExpressionMetadata(program)
	if err != nil {
		return nil, err
	}
	compiled := &compiledExpression{
		program:    program,
		expression: expression,
		hash:       hash,
		version:    version,
		usedVars:   metadata.usedVars,
		headerKeys: metadata.headerKeys,
		paramPaths: metadata.paramPaths,
	}
	return compiledExpressions.putIfAbsent(key, compiled), nil
}

func parseExpressionVersion(expression string) (string, string, error) {
	if strings.TrimSpace(expression) == "" {
		return "", "", fmt.Errorf("%w: expression must not be empty", ErrInvalidExpression)
	}
	if strings.HasPrefix(expression, "v1:") {
		body := expression[len("v1:"):]
		if strings.TrimSpace(body) == "" {
			return "", "", fmt.Errorf("%w: v1 expression body must not be empty", ErrInvalidExpression)
		}
		return defaultExpressionVersion, body, nil
	}
	if strings.HasPrefix(expression, "v") {
		if colon := strings.IndexByte(expression, ':'); colon > 0 {
			return "", "", fmt.Errorf("%w: unsupported expression version %q", ErrInvalidExpression, expression[:colon])
		}
	}
	return defaultExpressionVersion, expression, nil
}

func (cache *expressionLRU) get(key expressionCacheKey) *compiledExpression {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	element, found := cache.entries[key]
	if !found {
		return nil
	}
	cache.order.MoveToFront(element)
	return element.Value.(*expressionCacheEntry).compiled
}

func (cache *expressionLRU) putIfAbsent(key expressionCacheKey, compiled *compiledExpression) *compiledExpression {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if existing, found := cache.entries[key]; found {
		cache.order.MoveToFront(existing)
		return existing.Value.(*expressionCacheEntry).compiled
	}
	element := cache.order.PushFront(&expressionCacheEntry{key: key, compiled: compiled})
	cache.entries[key] = element
	if cache.order.Len() > expressionCacheCapacity {
		oldest := cache.order.Back()
		entry := oldest.Value.(*expressionCacheEntry)
		delete(cache.entries, entry.key)
		cache.order.Remove(oldest)
	}
	return compiled
}

func (compiled *compiledExpression) info() ExpressionInfo {
	return ExpressionInfo{
		Hash:       compiled.hash,
		Version:    compiled.version,
		UsedVars:   cloneBoolMap(compiled.usedVars),
		HeaderKeys: append([]string(nil), compiled.headerKeys...),
		ParamPaths: append([]string(nil), compiled.paramPaths...),
	}
}

func compileEnvironment() map[string]any {
	return map[string]any{
		"p":       float64(0),
		"c":       float64(0),
		"len":     float64(0),
		"cr":      float64(0),
		"cc":      float64(0),
		"cc1h":    float64(0),
		"img":     float64(0),
		"img_o":   float64(0),
		"ai":      float64(0),
		"ao":      float64(0),
		"tier":    func(string, float64) float64 { return 0 },
		"header":  func(string) string { return "" },
		"param":   func(string) any { return nil },
		"has":     func(any, string) bool { return false },
		"hour":    func(string) int { return 0 },
		"minute":  func(string) int { return 0 },
		"weekday": func(string) int { return 0 },
		"month":   func(string) int { return 0 },
		"day":     func(string) int { return 0 },
		"max":     math.Max,
		"min":     math.Min,
		"abs":     math.Abs,
		"ceil":    math.Ceil,
		"floor":   math.Floor,
	}
}

type expressionMetadata struct {
	usedVars   map[string]bool
	headerKeys []string
	paramPaths []string
}

func extractExpressionMetadata(program *vm.Program) (expressionMetadata, error) {
	visitor := expressionMetadataVisitor{
		usedVars:   make(map[string]bool),
		headerKeys: make(map[string]struct{}),
		paramPaths: make(map[string]struct{}),
	}
	node := program.Node()
	ast.Walk(&node, &visitor)
	if visitor.err != nil {
		return expressionMetadata{}, visitor.err
	}
	return expressionMetadata{
		usedVars:   visitor.usedVars,
		headerKeys: sortedSet(visitor.headerKeys),
		paramPaths: sortedSet(visitor.paramPaths),
	}, nil
}

type expressionMetadataVisitor struct {
	usedVars   map[string]bool
	headerKeys map[string]struct{}
	paramPaths map[string]struct{}
	err        error
}

func (visitor *expressionMetadataVisitor) Visit(node *ast.Node) {
	if visitor.err != nil {
		return
	}
	switch typed := (*node).(type) {
	case *ast.IdentifierNode:
		if _, allowed := allowedExpressionVariables[typed.Value]; allowed {
			visitor.usedVars[typed.Value] = true
		}
	case *ast.CallNode:
		identifier, ok := typed.Callee.(*ast.IdentifierNode)
		if !ok || (identifier.Value != "header" && identifier.Value != "param") {
			return
		}
		if len(typed.Arguments) != 1 {
			visitor.err = fmt.Errorf("%w: %s requires exactly one argument", ErrInvalidExpression, identifier.Value)
			return
		}
		literal, ok := typed.Arguments[0].(*ast.StringNode)
		if !ok {
			visitor.err = fmt.Errorf("%w: %s probe must use a string literal", ErrInvalidExpression, identifier.Value)
			return
		}
		if identifier.Value == "header" {
			key := normalizeHeaderKey(literal.Value)
			if isSensitiveHeader(key) {
				visitor.err = fmt.Errorf("%w: header(%q) is not allowed", ErrInvalidExpression, literal.Value)
				return
			}
			visitor.headerKeys[key] = struct{}{}
			return
		}
		visitor.paramPaths[strings.TrimSpace(literal.Value)] = struct{}{}
	}
}

var allowedExpressionVariables = map[string]struct{}{
	"p": {}, "c": {}, "len": {}, "cr": {}, "cc": {}, "cc1h": {}, "img": {}, "img_o": {}, "ai": {}, "ao": {},
}

func sortedSet(values map[string]struct{}) []string {
	if len(values) == 0 {
		return nil
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

type materializedProbes struct {
	headers map[string]string
	params  map[string]any
}

func emptyProbes(compiled *compiledExpression) materializedProbes {
	probes := materializedProbes{
		headers: make(map[string]string, len(compiled.headerKeys)),
		params:  make(map[string]any, len(compiled.paramPaths)),
	}
	for _, key := range compiled.headerKeys {
		probes.headers[key] = ""
	}
	for _, path := range compiled.paramPaths {
		probes.params[path] = nil
	}
	return probes
}

func materializeProbes(compiled *compiledExpression, request RequestInput) materializedProbes {
	probes := emptyProbes(compiled)
	headers := normalizeHeaders(request.Headers)
	for _, key := range compiled.headerKeys {
		probes.headers[key] = headers[key]
	}
	document := parseJSONDocument(request.Body)
	for _, path := range compiled.paramPaths {
		probes.params[path] = lookupJSONPath(document, path)
	}
	return probes
}

func normalizeHeaders(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return map[string]string{}
	}
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	normalized := make(map[string]string, len(headers))
	for _, key := range keys {
		normalized[normalizeHeaderKey(key)] = strings.TrimSpace(headers[key])
	}
	return normalized
}

func normalizeHeaderKey(key string) string {
	return strings.ToLower(strings.TrimSpace(key))
}

func isSensitiveHeader(key string) bool {
	switch key {
	case "authorization", "proxy-authorization", "cookie", "set-cookie":
		return true
	default:
		return false
	}
}

func parseJSONDocument(body []byte) any {
	if len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	var document any
	if err := decoder.Decode(&document); err != nil {
		return nil
	}
	return document
}

func lookupJSONPath(document any, path string) any {
	path = strings.TrimSpace(path)
	if path == "" || document == nil {
		return nil
	}
	current := document
	for _, segment := range strings.Split(path, ".") {
		switch value := current.(type) {
		case map[string]any:
			next, found := value[segment]
			if !found || next == nil {
				return nil
			}
			current = next
		case []any:
			if segment == "#" {
				current = float64(len(value))
				continue
			}
			index, err := strconv.Atoi(segment)
			if err != nil || index < 0 || index >= len(value) || value[index] == nil {
				return nil
			}
			current = value[index]
		default:
			return nil
		}
	}
	return cloneJSONValue(current)
}

func runCompiled(compiled *compiledExpression, params TokenParams, headers map[string]string, values map[string]any, evaluationTime time.Time) (ExpressionResult, error) {
	trace := ""
	environment := map[string]any{
		"p":     params.P,
		"c":     params.C,
		"len":   params.Len,
		"cr":    params.CR,
		"cc":    params.CC,
		"cc1h":  params.CC1h,
		"img":   params.Img,
		"img_o": params.ImgO,
		"ai":    params.AI,
		"ao":    params.AO,
		"tier": func(name string, value float64) float64 {
			trace = name
			return value
		},
		"header": func(key string) string {
			return headers[normalizeHeaderKey(key)]
		},
		"param": func(path string) any {
			return values[strings.TrimSpace(path)]
		},
		"has": func(source any, substring string) bool {
			return source != nil && substring != "" && strings.Contains(fmt.Sprint(source), substring)
		},
		"hour":    func(timezone string) int { return timeInZone(evaluationTime, timezone).Hour() },
		"minute":  func(timezone string) int { return timeInZone(evaluationTime, timezone).Minute() },
		"weekday": func(timezone string) int { return int(timeInZone(evaluationTime, timezone).Weekday()) },
		"month":   func(timezone string) int { return int(timeInZone(evaluationTime, timezone).Month()) },
		"day":     func(timezone string) int { return timeInZone(evaluationTime, timezone).Day() },
		"max":     math.Max,
		"min":     math.Min,
		"abs":     math.Abs,
		"ceil":    math.Ceil,
		"floor":   math.Floor,
	}
	output, err := expr.Run(compiled.program, environment)
	if err != nil {
		return ExpressionResult{}, fmt.Errorf("%w: run: %v", ErrInvalidExpression, err)
	}
	value, ok := output.(float64)
	if !ok {
		return ExpressionResult{}, fmt.Errorf("%w: output has type %T", ErrInvalidExpression, output)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return ExpressionResult{}, fmt.Errorf("%w: output is non-finite", ErrInvalidExpression)
	}
	if value < 0 {
		return ExpressionResult{}, fmt.Errorf("%w: output must not be negative", ErrInvalidExpression)
	}
	return ExpressionResult{Value: value, MatchedTier: trace}, nil
}

func frozenEvaluationTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Now().UTC()
	}
	return value
}

func timeInZone(evaluationTime time.Time, timezone string) time.Time {
	timezone = strings.TrimSpace(timezone)
	if timezone == "" {
		return evaluationTime.UTC()
	}
	location, err := time.LoadLocation(timezone)
	if err != nil {
		return evaluationTime.UTC()
	}
	return evaluationTime.In(location)
}
