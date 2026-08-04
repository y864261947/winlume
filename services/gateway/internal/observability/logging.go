// Package observability provides typed, secret-free Gateway telemetry.
package observability

import (
	"context"
	"io"
	"log/slog"
)

// Fields is intentionally closed over safe identifiers and classifications.
// It has no generic headers, body, URL, credential, or metadata field.
type Fields struct {
	RequestID   string
	UserID      string
	APIKeyID    string
	Protocol    string
	BillingMode string
	ChannelID   string
	StatusCode  int
	ErrorClass  string
}

type Logger struct {
	logger *slog.Logger
}

func NewLogger(writer io.Writer) *Logger {
	return &Logger{logger: slog.New(slog.NewJSONHandler(writer, nil))}
}

func (logger *Logger) Info(ctx context.Context, message string, fields Fields) {
	logger.log(ctx, slog.LevelInfo, message, fields)
}

func (logger *Logger) Warn(ctx context.Context, message string, fields Fields) {
	logger.log(ctx, slog.LevelWarn, message, fields)
}

func (logger *Logger) Error(ctx context.Context, message string, fields Fields) {
	logger.log(ctx, slog.LevelError, message, fields)
}

func (logger *Logger) log(ctx context.Context, level slog.Level, message string, fields Fields) {
	if logger == nil || logger.logger == nil {
		return
	}
	attributes := make([]any, 0, 16)
	appendString := func(name, value string) {
		if value != "" {
			attributes = append(attributes, name, value)
		}
	}
	appendString("request_id", fields.RequestID)
	appendString("user_id", fields.UserID)
	appendString("api_key_id", fields.APIKeyID)
	appendString("protocol", fields.Protocol)
	appendString("billing_mode", fields.BillingMode)
	appendString("channel_id", fields.ChannelID)
	appendString("error_class", fields.ErrorClass)
	if fields.StatusCode != 0 {
		attributes = append(attributes, "status_code", fields.StatusCode)
	}
	logger.logger.Log(ctx, level, message, attributes...)
}
