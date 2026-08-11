package httpapi

import (
	"net/http"
	"strings"

	"reizo/services/gateway/internal/config"
)

var allowedPublicMethods = []string{
	http.MethodGet,
	http.MethodPost,
	http.MethodPut,
	http.MethodPatch,
	http.MethodDelete,
}

const allowedPublicMethodsHeader = "GET, POST, PUT, PATCH, DELETE"

// Route describes one explicit public protocol surface.
type Route struct {
	ID          string                `json:"id"`
	Family      config.ProtocolFamily `json:"family"`
	Description string                `json:"description"`
	Prefixes    []string              `json:"-"`
	Methods     []string              `json:"methods"`
}

// PublicRoutes is ordered from the most specific protocol path to the generic
// OpenAI-compatible /v1 path.
var PublicRoutes = []Route{
	newRoute("openai-images", config.ProtocolImages, "OpenAI-compatible image generation and editing", "/v1/images"),
	newRoute("openai-audio", config.ProtocolAudio, "OpenAI-compatible audio speech, transcription, and translation", "/v1/audio"),
	newRoute("openai-embeddings", config.ProtocolEmbeddings, "OpenAI-compatible embeddings", "/v1/embeddings"),
	newRoute("openai-realtime", config.ProtocolRealtime, "OpenAI-compatible realtime HTTP handshake", "/v1/realtime"),
	newRoute("claude-messages", config.ProtocolClaude, "Anthropic Claude messages protocol", "/v1/messages", "/anthropic/v1/messages"),
	newRoute("gemini-models", config.ProtocolGemini, "Google Gemini generate-content protocol", "/v1beta/models", "/gemini/v1beta/models"),
	newRoute("midjourney", config.ProtocolMidjourney, "Midjourney task protocol", "/mj", "/midjourney"),
	newRoute("suno", config.ProtocolSuno, "Suno task protocol", "/suno"),
	newRoute("video", config.ProtocolVideo, "Video generation and task protocol", "/video", "/videos", "/v1/video", "/v1/videos"),
	newRoute("tasks", config.ProtocolTask, "Asynchronous task and job protocol", "/api/task", "/api/tasks", "/api/async", "/api/queue", "/v1/tasks", "/v1/jobs"),
	newRoute("openai", config.ProtocolOpenAI, "OpenAI-compatible core API", "/v1"),
}

func newRoute(id string, family config.ProtocolFamily, description string, prefixes ...string) Route {
	return Route{
		ID:          id,
		Family:      family,
		Description: description,
		Prefixes:    prefixes,
		Methods:     append([]string(nil), allowedPublicMethods...),
	}
}

// MatchPublicRoute returns a route only when both its path and method are
// explicitly exposed.
func MatchPublicRoute(path, method string) (Route, bool) {
	route, ok := matchPublicPath(path)
	if !ok || !methodAllowed(method) {
		return Route{}, false
	}
	return route, true
}

func matchPublicPath(path string) (Route, bool) {
	for _, route := range PublicRoutes {
		for _, prefix := range route.Prefixes {
			if path == prefix || strings.HasPrefix(path, prefix+"/") {
				return route, true
			}
		}
	}
	return Route{}, false
}

func methodAllowed(method string) bool {
	method = strings.ToUpper(method)
	for _, allowed := range allowedPublicMethods {
		if method == allowed {
			return true
		}
	}
	return false
}
