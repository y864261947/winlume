package pricing

import (
	"bytes"
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/expr-lang/expr"
	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/expr-lang/expr/vm"
)

const (
	defaultExpressionVersion = "v1"
	expressionCacheCapacity  = 256
	// Expr evaluates TokenParams as float64. Keeping the source counts within
	// the exactly representable integer range makes static float-domain checks
	// meaningful without imposing the later quota conversion limit.
	maxExactExpressionTokenValue = float64(1 << 53)
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
	return FreezeExpressionWithPolicy(expression, expectedHash, ProbePolicy{}, estimate, request)
}

// FreezeExpressionWithPolicy materializes only probes referenced by the
// expression and explicitly approved by the frozen catalog policy.
func FreezeExpressionWithPolicy(expression, expectedHash string, policy ProbePolicy, estimate TokenParams, request RequestInput) (*ExpressionSnapshot, error) {
	compiled, err := compiledExpressionFor(expression, expectedHash)
	if err != nil {
		return nil, err
	}
	policy, err = normalizedCompiledProbePolicy(compiled, policy)
	if err != nil {
		return nil, err
	}
	probes, err := materializeProbes(compiled, request)
	if err != nil {
		return nil, err
	}
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
		ProbePolicy:    cloneProbePolicy(policy),
		HeaderProbes:   cloneStringMap(probes.headers),
		ParamProbes:    cloneAnyMap(probes.params),
		EstimatedTier:  result.MatchedTier,
		EvaluationTime: evaluationTime,
	}, nil
}

// RunExpression evaluates an expression against a current request. Relay code
// should use FreezeExpression before relay, then RunFrozenExpression later.
func RunExpression(expression, expectedHash string, params TokenParams, request RequestInput) (ExpressionResult, error) {
	return RunExpressionWithPolicy(expression, expectedHash, ProbePolicy{}, params, request)
}

// RunExpressionWithPolicy evaluates an unfrozen expression using only probes
// approved by the supplied policy. Relay code should freeze first instead.
func RunExpressionWithPolicy(expression, expectedHash string, policy ProbePolicy, params TokenParams, request RequestInput) (ExpressionResult, error) {
	compiled, err := compiledExpressionFor(expression, expectedHash)
	if err != nil {
		return ExpressionResult{}, err
	}
	if _, err := normalizedCompiledProbePolicy(compiled, policy); err != nil {
		return ExpressionResult{}, err
	}
	probes, err := materializeProbes(compiled, request)
	if err != nil {
		return ExpressionResult{}, err
	}
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
	if err := validateExpressionNumericDomain(body); err != nil {
		return nil, fmt.Errorf("%w: numeric validation: %v", ErrInvalidExpression, err)
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

type numericDomain struct {
	min float64
	max float64
}

// validateExpressionNumericDomain examines the source AST instead of a small
// collection of runtime vectors. It accepts finite signed intermediate ranges,
// then requires the expression result itself to be non-negative.
func validateExpressionNumericDomain(body string) error {
	tree, err := parser.Parse(body)
	if err != nil {
		return fmt.Errorf("parse expression: %v", err)
	}
	if err := validateNestedNumericOperations(tree.Node); err != nil {
		return err
	}
	domain, err := numericDomainFor(tree.Node)
	if err != nil {
		return err
	}
	_, err = requireNonNegativeNumericDomain(domain, "expression result")
	return err
}

func validateNestedNumericOperations(node ast.Node) error {
	switch typed := node.(type) {
	case *ast.UnaryNode:
		if typed.Operator == "-" || typed.Operator == "+" {
			if _, err := numericDomainFor(node); err != nil {
				return err
			}
		}
		return validateNestedNumericOperations(typed.Node)
	case *ast.BinaryNode:
		switch typed.Operator {
		case "+", "-", "*", "/", "%", "**":
			if _, err := numericDomainFor(node); err != nil {
				return err
			}
		}
		if err := validateNestedNumericOperations(typed.Left); err != nil {
			return err
		}
		return validateNestedNumericOperations(typed.Right)
	case *ast.ConditionalNode:
		if err := validateNestedNumericOperations(typed.Cond); err != nil {
			return err
		}
		if err := validateNestedNumericOperations(typed.Exp1); err != nil {
			return err
		}
		return validateNestedNumericOperations(typed.Exp2)
	case *ast.CallNode:
		if identifier, ok := typed.Callee.(*ast.IdentifierNode); ok && identifier.Value == "tier" {
			if len(typed.Arguments) != 2 {
				return fmt.Errorf("tier requires exactly two arguments")
			}
			if _, err := numericDomainFor(typed.Arguments[1]); err != nil {
				return err
			}
		}
		for _, argument := range typed.Arguments {
			if err := validateNestedNumericOperations(argument); err != nil {
				return err
			}
		}
	case *ast.BuiltinNode:
		for _, argument := range typed.Arguments {
			if err := validateNestedNumericOperations(argument); err != nil {
				return err
			}
		}
	case *ast.ChainNode:
		return validateNestedNumericOperations(typed.Node)
	case *ast.MemberNode:
		if err := validateNestedNumericOperations(typed.Node); err != nil {
			return err
		}
		return validateNestedNumericOperations(typed.Property)
	case *ast.SliceNode:
		if err := validateNestedNumericOperations(typed.Node); err != nil {
			return err
		}
		if typed.From != nil {
			if err := validateNestedNumericOperations(typed.From); err != nil {
				return err
			}
		}
		if typed.To != nil {
			return validateNestedNumericOperations(typed.To)
		}
	case *ast.PredicateNode:
		return validateNestedNumericOperations(typed.Node)
	case *ast.VariableDeclaratorNode:
		if err := validateNestedNumericOperations(typed.Value); err != nil {
			return err
		}
		return validateNestedNumericOperations(typed.Expr)
	case *ast.SequenceNode:
		for _, child := range typed.Nodes {
			if err := validateNestedNumericOperations(child); err != nil {
				return err
			}
		}
	case *ast.ArrayNode:
		for _, child := range typed.Nodes {
			if err := validateNestedNumericOperations(child); err != nil {
				return err
			}
		}
	case *ast.MapNode:
		for _, child := range typed.Pairs {
			if err := validateNestedNumericOperations(child); err != nil {
				return err
			}
		}
	case *ast.PairNode:
		if err := validateNestedNumericOperations(typed.Key); err != nil {
			return err
		}
		return validateNestedNumericOperations(typed.Value)
	}
	return nil
}

func numericDomainFor(node ast.Node) (numericDomain, error) {
	switch typed := node.(type) {
	case *ast.IntegerNode:
		value := float64(typed.Value)
		return checkedNumericDomain(value, value, "numeric literal")
	case *ast.FloatNode:
		return checkedNumericDomain(typed.Value, typed.Value, "numeric literal")
	case *ast.IdentifierNode:
		if _, allowed := allowedExpressionVariables[typed.Value]; !allowed {
			return numericDomain{}, fmt.Errorf("numeric identifier %q is not allowed", typed.Value)
		}
		return numericDomain{min: 0, max: maxExactExpressionTokenValue}, nil
	case *ast.UnaryNode:
		value, err := numericDomainFor(typed.Node)
		if err != nil {
			return numericDomain{}, err
		}
		switch typed.Operator {
		case "+":
			return value, nil
		case "-":
			return checkedNumericDomain(-value.max, -value.min, "unary negation")
		default:
			return numericDomain{}, fmt.Errorf("numeric unary operator %q is not allowed", typed.Operator)
		}
	case *ast.BinaryNode:
		return numericBinaryDomain(typed)
	case *ast.ConditionalNode:
		left, err := numericDomainFor(typed.Exp1)
		if err != nil {
			return numericDomain{}, err
		}
		right, err := numericDomainFor(typed.Exp2)
		if err != nil {
			return numericDomain{}, err
		}
		return checkedNumericDomain(math.Min(left.min, right.min), math.Max(left.max, right.max), "conditional branch")
	case *ast.CallNode:
		identifier, ok := typed.Callee.(*ast.IdentifierNode)
		if !ok {
			return numericDomain{}, fmt.Errorf("numeric call must use a named function")
		}
		return numericFunctionDomain(identifier.Value, typed.Arguments)
	case *ast.BuiltinNode:
		return numericFunctionDomain(typed.Name, typed.Arguments)
	default:
		return numericDomain{}, fmt.Errorf("numeric expression %T is not allowed", node)
	}
}

func numericBinaryDomain(node *ast.BinaryNode) (numericDomain, error) {
	left, err := numericDomainFor(node.Left)
	if err != nil {
		return numericDomain{}, err
	}
	right, err := numericDomainFor(node.Right)
	if err != nil {
		return numericDomain{}, err
	}

	switch node.Operator {
	case "+":
		return checkedNumericDomain(left.min+right.min, left.max+right.max, "addition")
	case "-":
		return checkedNumericDomain(left.min-right.max, left.max-right.min, "subtraction")
	case "*":
		return numericDomainFromValues("multiplication",
			left.min*right.min,
			left.min*right.max,
			left.max*right.min,
			left.max*right.max,
		)
	case "/":
		if right.min <= 0 && right.max >= 0 {
			return numericDomain{}, fmt.Errorf("division denominator must be proven non-zero")
		}
		return numericDomainFromValues("division",
			left.min/right.min,
			left.min/right.max,
			left.max/right.min,
			left.max/right.max,
		)
	default:
		return numericDomain{}, fmt.Errorf("numeric operator %q is not allowed", node.Operator)
	}
}

func numericFunctionDomain(name string, arguments []ast.Node) (numericDomain, error) {
	switch name {
	case "tier":
		if len(arguments) != 2 {
			return numericDomain{}, fmt.Errorf("tier requires exactly two arguments")
		}
		value, err := numericDomainFor(arguments[1])
		if err != nil {
			return numericDomain{}, err
		}
		return requireNonNegativeNumericDomain(value, "tier result")
	case "hour":
		return numericTimeFunctionDomain(name, arguments, 0, 23)
	case "minute":
		return numericTimeFunctionDomain(name, arguments, 0, 59)
	case "weekday":
		return numericTimeFunctionDomain(name, arguments, 0, 6)
	case "month":
		return numericTimeFunctionDomain(name, arguments, 1, 12)
	case "day":
		return numericTimeFunctionDomain(name, arguments, 1, 31)
	case "max", "min":
		if len(arguments) != 2 {
			return numericDomain{}, fmt.Errorf("%s requires exactly two arguments", name)
		}
		left, err := numericDomainFor(arguments[0])
		if err != nil {
			return numericDomain{}, err
		}
		right, err := numericDomainFor(arguments[1])
		if err != nil {
			return numericDomain{}, err
		}
		if name == "max" {
			return checkedNumericDomain(math.Max(left.min, right.min), math.Max(left.max, right.max), name)
		}
		return checkedNumericDomain(math.Min(left.min, right.min), math.Min(left.max, right.max), name)
	case "abs", "ceil", "floor":
		if len(arguments) != 1 {
			return numericDomain{}, fmt.Errorf("%s requires exactly one argument", name)
		}
		value, err := numericDomainFor(arguments[0])
		if err != nil {
			return numericDomain{}, err
		}
		switch name {
		case "abs":
			return checkedNumericDomain(0, math.Max(math.Abs(value.min), math.Abs(value.max)), name)
		case "ceil":
			return checkedNumericDomain(math.Ceil(value.min), math.Ceil(value.max), name)
		case "floor":
			return checkedNumericDomain(math.Floor(value.min), math.Floor(value.max), name)
		default:
			return numericDomain{}, fmt.Errorf("numeric function %q is not allowed", name)
		}
	default:
		return numericDomain{}, fmt.Errorf("numeric function %q is not allowed", name)
	}
}

func numericTimeFunctionDomain(name string, arguments []ast.Node, minimum, maximum float64) (numericDomain, error) {
	if len(arguments) != 1 {
		return numericDomain{}, fmt.Errorf("%s requires exactly one argument", name)
	}
	if _, ok := arguments[0].(*ast.StringNode); !ok {
		return numericDomain{}, fmt.Errorf("%s timezone must be a string literal", name)
	}
	return numericDomain{min: minimum, max: maximum}, nil
}

func checkedNumericDomain(minimum, maximum float64, operation string) (numericDomain, error) {
	if !isFinite(minimum) || !isFinite(maximum) || minimum > maximum {
		return numericDomain{}, fmt.Errorf("%s can produce a non-finite value", operation)
	}
	return numericDomain{min: minimum, max: maximum}, nil
}

func numericDomainFromValues(operation string, values ...float64) (numericDomain, error) {
	if len(values) == 0 {
		return numericDomain{}, fmt.Errorf("%s has no numeric values", operation)
	}
	minimum, maximum := values[0], values[0]
	for _, value := range values[1:] {
		minimum = math.Min(minimum, value)
		maximum = math.Max(maximum, value)
	}
	return checkedNumericDomain(minimum, maximum, operation)
}

func requireNonNegativeNumericDomain(domain numericDomain, result string) (numericDomain, error) {
	if domain.min < 0 {
		return numericDomain{}, fmt.Errorf("%s can be negative", result)
	}
	return domain, nil
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func isFiniteNonNegative(value float64) bool {
	return value >= 0 && isFinite(value)
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
		path := strings.TrimSpace(literal.Value)
		if isSensitiveParamPath(path) {
			visitor.err = fmt.Errorf("%w: param(%q) is not allowed", ErrInvalidExpression, literal.Value)
			return
		}
		visitor.paramPaths[path] = struct{}{}
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

func materializeProbes(compiled *compiledExpression, request RequestInput) (materializedProbes, error) {
	probes := emptyProbes(compiled)
	headers := normalizeHeaders(request.Headers)
	for _, key := range compiled.headerKeys {
		probes.headers[key] = headers[key]
	}
	if len(compiled.paramPaths) == 0 {
		return probes, nil
	}
	document, err := parseJSONDocument(request.Body)
	if err != nil {
		return materializedProbes{}, fmt.Errorf("%w: %v", ErrInvalidExpression, err)
	}
	for _, path := range compiled.paramPaths {
		probes.params[path] = lookupJSONPath(document, path)
	}
	return probes, nil
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
	key = normalizeHeaderKey(key)
	if _, sensitive := sensitiveHeaderNames[key]; sensitive {
		return true
	}
	tokens := headerKeyTokens(key)
	for _, token := range tokens {
		if _, sensitive := sensitiveHeaderTokens[token]; sensitive {
			return true
		}
	}
	for _, pattern := range sensitiveHeaderTokenPatterns {
		if containsHeaderTokenPattern(tokens, pattern) {
			return true
		}
	}
	return false
}

func headerKeyTokens(key string) []string {
	return strings.FieldsFunc(normalizeHeaderKey(key), func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
}

func containsHeaderTokenPattern(tokens, pattern []string) bool {
	for start := 0; start+len(pattern) <= len(tokens); start++ {
		matched := true
		for offset, token := range pattern {
			if tokens[start+offset] != token {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}

func isSensitiveParamPath(path string) bool {
	for _, segment := range strings.Split(strings.ToLower(strings.TrimSpace(path)), ".") {
		if _, sensitive := sensitiveParamSegments[strings.TrimSpace(segment)]; sensitive {
			return true
		}
	}
	return false
}

var sensitiveHeaderNames = map[string]struct{}{
	"authorization":       {},
	"cookie":              {},
	"set-cookie":          {},
	"proxy-authorization": {},
	"x-api-key":           {},
	"x-goog-api-key":      {},
}

var sensitiveHeaderTokens = map[string]struct{}{
	"apikey":      {},
	"secret":      {},
	"password":    {},
	"credential":  {},
	"credentials": {},
	"cookie":      {},
}

var sensitiveHeaderTokenPatterns = [][]string{
	{"api", "key"},
	{"auth", "token"},
	{"access", "token"},
	{"refresh", "token"},
	{"client", "secret"},
}

var sensitiveParamSegments = map[string]struct{}{
	"api_key":       {},
	"apikey":        {},
	"token":         {},
	"access_token":  {},
	"refresh_token": {},
	"auth_token":    {},
	"secret":        {},
	"client_secret": {},
	"password":      {},
	"credential":    {},
	"credentials":   {},
}

func normalizeProbePolicy(policy ProbePolicy) (ProbePolicy, error) {
	headers := make(map[string]struct{}, len(policy.HeaderNames))
	for _, raw := range policy.HeaderNames {
		key := normalizeHeaderKey(raw)
		if key == "" {
			return ProbePolicy{}, fmt.Errorf("header allowlist contains an empty name")
		}
		if isSensitiveHeader(key) {
			return ProbePolicy{}, fmt.Errorf("header(%q) is not allowed", raw)
		}
		headers[key] = struct{}{}
	}
	params := make(map[string]struct{}, len(policy.ParamPaths))
	for _, raw := range policy.ParamPaths {
		path := strings.TrimSpace(raw)
		if path == "" {
			return ProbePolicy{}, fmt.Errorf("param allowlist contains an empty path")
		}
		if isSensitiveParamPath(path) {
			return ProbePolicy{}, fmt.Errorf("param(%q) is not allowed", raw)
		}
		params[path] = struct{}{}
	}
	return ProbePolicy{HeaderNames: sortedSet(headers), ParamPaths: sortedSet(params)}, nil
}

func normalizedCompiledProbePolicy(compiled *compiledExpression, policy ProbePolicy) (ProbePolicy, error) {
	normalized, err := normalizeProbePolicy(policy)
	if err != nil {
		return ProbePolicy{}, fmt.Errorf("%w: probe policy: %v", ErrInvalidExpression, err)
	}
	if err := validateCompiledProbePolicy(compiled.info(), normalized); err != nil {
		return ProbePolicy{}, fmt.Errorf("%w: probe policy: %v", ErrInvalidExpression, err)
	}
	return normalized, nil
}

func validateCompiledProbePolicy(info ExpressionInfo, policy ProbePolicy) error {
	headers := make(map[string]struct{}, len(policy.HeaderNames))
	for _, key := range policy.HeaderNames {
		headers[key] = struct{}{}
	}
	for _, key := range info.HeaderKeys {
		if _, allowed := headers[key]; !allowed {
			return fmt.Errorf("header(%q) is not approved", key)
		}
	}
	params := make(map[string]struct{}, len(policy.ParamPaths))
	for _, path := range policy.ParamPaths {
		params[path] = struct{}{}
	}
	for _, path := range info.ParamPaths {
		if _, allowed := params[path]; !allowed {
			return fmt.Errorf("param(%q) is not approved", path)
		}
	}
	return nil
}

func parseJSONDocument(body []byte) (any, error) {
	if len(bytes.TrimSpace(body)) == 0 {
		return nil, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	var document any
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("body must contain exactly one JSON document: %w", err)
	}
	var additional any
	if err := decoder.Decode(&additional); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("body must contain exactly one JSON document")
		}
		return nil, fmt.Errorf("body must contain exactly one JSON document: %w", err)
	}
	return document, nil
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
	if err := validateTokenParams(params); err != nil {
		return ExpressionResult{}, err
	}
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

func validateTokenParams(params TokenParams) error {
	for _, parameter := range []struct {
		name  string
		value float64
	}{
		{name: "p", value: params.P},
		{name: "c", value: params.C},
		{name: "len", value: params.Len},
		{name: "cr", value: params.CR},
		{name: "cc", value: params.CC},
		{name: "cc1h", value: params.CC1h},
		{name: "img", value: params.Img},
		{name: "img_o", value: params.ImgO},
		{name: "ai", value: params.AI},
		{name: "ao", value: params.AO},
	} {
		if !isFiniteNonNegative(parameter.value) || parameter.value > maxExactExpressionTokenValue {
			return fmt.Errorf("%w: token parameter %s must be finite, non-negative, and at most %.0f", ErrInvalidExpression, parameter.name, maxExactExpressionTokenValue)
		}
	}
	return nil
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
