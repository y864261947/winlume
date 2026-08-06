package usage

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRegistryLimitsRejectResponseAcrossObservations(t *testing.T) {
	registry := NewRegistryWithLimits(Limits{MaxResponseBytes: 10})
	observer, err := registry.New("openai", "application/json", Estimate{PromptTokens: 7, Model: "gpt-4o-mini", Protocol: "openai"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte(`{"usage":`)))
	require.ErrorIs(t, observer.Observe([]byte(`{}}`)), ErrObservationLimitExceeded)
	require.ErrorIs(t, observer.Observe([]byte(`x`)), ErrObservationLimitExceeded)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrObservationLimitExceeded)
	require.False(t, actual.Complete)
	require.Equal(t, "observation_limit_exceeded", actual.TerminalEvent)
}

func TestRegistryLimitsApplyToAudioResponses(t *testing.T) {
	registry := NewRegistryWithLimits(Limits{MaxResponseBytes: 4})
	observer, err := registry.New("audio_speech", "audio/mpeg", Estimate{Model: "gpt-4o-mini-tts", Protocol: "audio"})
	require.NoError(t, err)
	require.NoError(t, observer.Observe([]byte{1, 2}))
	require.ErrorIs(t, observer.Observe([]byte{3, 4, 5}), ErrObservationLimitExceeded)

	actual, completeErr := observer.Complete(Completion{StatusCode: 200, EOF: true})
	require.ErrorIs(t, completeErr, ErrObservationLimitExceeded)
	require.False(t, actual.Complete)
	require.Equal(t, "observation_limit_exceeded", actual.TerminalEvent)
}

func TestObserversRejectObserveAndCompleteAfterFinalization(t *testing.T) {
	tests := []struct {
		name        string
		protocol    string
		contentType string
		payload     []byte
	}{
		{name: "OpenAI JSON", protocol: "openai", contentType: "application/json", payload: []byte(`{"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`)},
		{name: "OpenAI SSE", protocol: "openai", contentType: "text/event-stream", payload: []byte("data: [DONE]\n\n")},
		{name: "image JSON", protocol: "images", contentType: "application/json", payload: []byte(`{"data":[{}]}`)},
		{name: "speech binary", protocol: "audio_speech", contentType: "audio/mpeg", payload: []byte{1}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			observer, err := NewRegistry().New(test.protocol, test.contentType, Estimate{Model: "gpt-4o-mini", Protocol: test.protocol})
			require.NoError(t, err)
			require.NoError(t, observer.Observe(test.payload))
			_, err = observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.NoError(t, err)

			require.ErrorIs(t, observer.Observe([]byte("later")), ErrObserverFinalized)
			_, err = observer.Complete(Completion{StatusCode: 200, EOF: true})
			require.ErrorIs(t, err, ErrObserverFinalized)
		})
	}
}
