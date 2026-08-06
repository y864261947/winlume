package httpapi

import (
	"encoding/json"
	"net/http"
)

// ErrorBody is the stable OpenAI-compatible Gateway error envelope.
type ErrorBody struct {
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	RequestID string `json:"request_id"`
}

func writeError(
	response http.ResponseWriter,
	status int,
	errorType string,
	code string,
	message string,
	requestID string,
) {
	body := ErrorBody{RequestID: requestID}
	body.Error.Type = errorType
	body.Error.Code = code
	body.Error.Message = message
	writeJSON(response, status, body)
}

// WriteError lets process assembly and later billing orchestration return the
// same stable envelope without duplicating HTTP error semantics.
func WriteError(
	response http.ResponseWriter,
	status int,
	errorType string,
	code string,
	message string,
	requestID string,
) {
	writeError(response, status, errorType, code, message, requestID)
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.Header().Set("Content-Type", "application/json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}
