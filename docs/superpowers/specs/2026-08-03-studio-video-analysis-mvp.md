# Studio Reference Video Analysis MVP

**Date:** 2026-08-03
**Status:** Ready for isolated validation
**Scope:** Upload an authorized short video and create a durable, editable script-and-storyboard analysis in Studio. It does not generate or imitate a finished video.

## Product boundary

The user-facing feature is named **"参考视频拆解"**. It extracts reusable content structure, not protected expression. The product must not promise an exact visual/audio copy or accept automated downloads from third-party social platforms.

MVP supports one user-uploaded MP4, MOV, or WebM per turn, at most 50 MB. The worker's default short-video guard is 10 minutes. Users confirm they have the right to use the reference before analysis is submitted.

## UX

1. A user attaches a video to the existing Studio composer and confirms authorization.
2. On send, Studio persists a `video` artifact and submits a `video-analysis` job.
3. The conversation stays usable. The works panel receives a pending "视频拆解" artifact.
4. When ready, the existing preview pane shows the source player, high-level structure, transcript, and seekable, editable scene cards.
5. Editing a scene can be explicitly saved to the analysis artifact. Later phases will turn this artifact into a dedicated video project workspace.
6. If the Worker was temporarily unavailable, the queued artifact exposes a re-dispatch action; terminal failures are retained for inspection rather than silently rerun.

No permanent "视频中心" navigation item, modal wizard, timeline editor, or video-generation model is added in this phase.

## Artifact contract

`ArtifactKind` adds:

- `video`: source bytes, served as a range-capable media response.
- `video-analysis`: UTF-8 JSON following `src/lib/studio/video-analysis.ts`.

The analysis envelope contains the source artifact id, durable job id, detailed worker stage, metadata, transcript, global structure, and scene cards. The `Artifact.status` field remains the UI-level pending/ready/failed state; detailed progress belongs in the envelope and job record.

## Worker boundary

Studio owns authentication, artifact persistence, and UI. A separate media worker owns expensive work:

```text
Studio Route Handler -> Media Worker -> callback Route Handler
    source artifact       FFmpeg / ASR / VLM        analysis artifact
```

The worker fetches a one-job source endpoint using a shared internal token and posts its normalized output back to Studio. The MVP file-backed job adapter is intentionally replaceable with a database queue and object storage.

Recommended implementation components:

- FFmpeg / ffprobe for probe, audio extraction, and scene cuts.
- PySceneDetect can replace the FFmpeg scene filter if it proves more accurate.
- faster-whisper or the configured OpenAI-compatible transcription endpoint for speech.
- PaddleOCR and a vision model are optional enrichments, not UI contracts.

## Explicit non-goals

- URL scraping or downloading from Douyin, TikTok, Xiaohongshu, etc.
- one-click near-duplicate video generation;
- cloning voices, faces, music, logos, or watermarks;
- manual multi-track timeline editing;
- running FFmpeg, ASR, or a video model in the Next.js application process.

## Open-source adoption rule

For every later media component, document one of `adopt`, `adapt`, `reference`, or `build`. Prefer an actively maintained MIT/Apache dependency with a stable API. Review model-weight licenses separately from source-code licenses.
