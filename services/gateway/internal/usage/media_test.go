package usage

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestImageNormalizesTokenUsageAndOneQualifiedCall(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "image.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("images", "application/json", Estimate{Model: "gpt-image-1", Protocol: "images"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(20), actual.ImageInputTokens)
	require.Equal(t, int64(120), actual.ImageOutputTokens)
	require.Equal(t, map[string]int64{"image_generation:1024x1024:hd": 1}, actual.Calls)
	require.Equal(t, Upstream, actual.Fields["image_input_tokens"])
	require.Equal(t, Upstream, actual.Fields["image_output_tokens"])
	require.True(t, actual.Complete)
}

func TestMediaJSONRejectsTrailingJSON(t *testing.T) {
	observer, err := NewRegistry().New("images", "application/json", Estimate{Model: "gpt-image-1", Protocol: "images"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"data":[{}]} {"ignored":true}`)))

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.Error(t, completeErr)
	require.False(t, actual.Complete)
}

func TestImageWithoutTokenUsageUsesOneBillableUnit(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "image-without-usage.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("images", "application/json", Estimate{PromptTokens: 999, Model: "gpt-image-1", Protocol: "images"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(1), actual.TextInputTokens)
	require.Equal(t, Derived, actual.Fields["text_input_tokens"])
	require.Equal(t, map[string]int64{"image_generation:unspecified:standard": 1}, actual.Calls)
}

func TestImageDefaultsCallCountToOneWhenResponseOmitsDataAndN(t *testing.T) {
	observer, err := NewRegistry().New("images", "application/json", Estimate{Model: "gpt-image-1", Protocol: "images"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"created":1722794400}`)))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, map[string]int64{"image_generation:unspecified:standard": 1}, actual.Calls)
}

func TestImageUsesDeclaredNWhenResponseOmitsData(t *testing.T) {
	observer, err := NewRegistry().New("images", "application/json", Estimate{Model: "gpt-image-1", Protocol: "images"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"created":1722794400,"n":3,"size":"1024x1024","quality":"standard"}`)))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, map[string]int64{"image_generation:1024x1024:standard": 3}, actual.Calls)
}

func TestResponsesCountsEveryImageGenerationCall(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "responses-image-calls.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("responses", "application/json", Estimate{Model: "gpt-image-1", Protocol: "responses"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, map[string]int64{
		"image_generation:1024x1024:low":  1,
		"image_generation:1792x1024:high": 1,
	}, actual.Calls)
	require.True(t, actual.Complete)
}

func TestResponsesSSECountsEveryImageGenerationCall(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "responses-image-calls.sse"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("responses", "text/event-stream", Estimate{Model: "gpt-image-1", Protocol: "responses"})
	require.NoError(t, err)
	for _, chunk := range splitUsageChunks(payload, 17, 107) {
		require.NoError(t, observer.Observe(chunk))
	}

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, map[string]int64{
		"image_generation:1024x1024:low":  1,
		"image_generation:1792x1024:high": 1,
	}, actual.Calls)
	require.Equal(t, Upstream, actual.Fields["calls.image_generation:1024x1024:low"])
	require.True(t, actual.Complete)
}

func TestAudioTranscriptionMapsValidInputAndOutputUsage(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "transcription.json"))
	require.NoError(t, err)

	observer, err := NewRegistry().New("audio_transcription", "application/json", Estimate{PromptTokens: 99, Model: "gpt-4o-transcribe", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(44), actual.TextInputTokens)
	require.Equal(t, int64(7), actual.TextOutputTokens)
	require.Equal(t, Upstream, actual.Fields["text_input_tokens"])
	require.Equal(t, Upstream, actual.Fields["text_output_tokens"])
	require.True(t, actual.Complete)
}

func TestAudioTranscriptionWithoutUsageFallsBackToRequestEstimate(t *testing.T) {
	observer, err := NewRegistry().New("audio_transcription", "application/json", Estimate{PromptTokens: 14, Model: "gpt-4o-transcribe", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"text":"A sanitized transcript."}`)))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(14), actual.TextInputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.True(t, actual.Complete)
}

func TestAudioTranscriptionPartialOrInvalidUsageFallsBackToRequestEstimate(t *testing.T) {
	for _, test := range []struct {
		name    string
		payload string
	}{
		{name: "missing output", payload: `{"text":"A sanitized transcript.","usage":{"input_tokens":44}}`},
		{name: "empty input", payload: `{"text":"A sanitized transcript.","usage":{"input_tokens":"","output_tokens":7}}`},
		{name: "negative output", payload: `{"text":"A sanitized transcript.","usage":{"input_tokens":44,"output_tokens":-1}}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New("audio_transcription", "application/json", Estimate{PromptTokens: 14, Model: "gpt-4o-transcribe", Protocol: "audio"})
			require.NoError(t, err)
			require.NoError(t, observer.Observe([]byte(test.payload)))

			actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.NoError(t, err)
			require.Equal(t, int64(14), actual.TextInputTokens)
			require.Zero(t, actual.TextOutputTokens)
			require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
			require.True(t, actual.Complete)
		})
	}
}

func TestAudioSpeechDerivesDurationAndAudioOutputTokensFromWAV(t *testing.T) {
	encoded, err := os.ReadFile(filepath.Join("..", "..", "testdata", "usage", "openai", "speech-wav.base64"))
	require.NoError(t, err)
	payload, err := base64.StdEncoding.DecodeString(string(encoded))
	require.NoError(t, err)

	observer, err := NewRegistry().New("audio_speech", "audio/wav", Estimate{PromptTokens: 11, Model: "gpt-4o-mini-tts", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload[:17]))
	require.NoError(t, observer.Observe(payload[17:]))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(11), actual.TextInputTokens)
	require.Equal(t, int64(1), actual.DurationMilliseconds)
	require.Equal(t, int64(17), actual.AudioOutputTokens)
	require.Equal(t, RequestEstimate, actual.Fields["text_input_tokens"])
	require.Equal(t, Derived, actual.Fields["audio_output_tokens"])
	require.True(t, actual.Complete)
}

func TestAudioSpeechDerivesDurationFromRawPCM(t *testing.T) {
	payload := bytes.Repeat([]byte{0}, 24_000*2)
	observer, err := NewRegistry().New("audio_speech", "audio/pcm;rate=24000", Estimate{Model: "gpt-4o-mini-tts", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(payload))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Equal(t, int64(1_000), actual.DurationMilliseconds)
	require.Equal(t, int64(17), actual.AudioOutputTokens)
	require.Equal(t, Derived, actual.Fields["duration_milliseconds"])
}

func TestAudioSpeechUsesKilobyteFallbackForUnknownFormat(t *testing.T) {
	observer, err := NewRegistry().New("audio_speech", "audio/mpeg", Estimate{Model: "gpt-4o-mini-tts", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe(bytes.Repeat([]byte{0}, 1_001)))

	actual, err := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.NoError(t, err)
	require.Zero(t, actual.DurationMilliseconds)
	require.Equal(t, int64(2), actual.AudioOutputTokens)
	require.Equal(t, Derived, actual.Fields["audio_output_tokens"])
}
