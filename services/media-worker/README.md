# Reizo Media Worker

The media worker is the isolated execution boundary for the Studio **参考视频拆解** MVP. It is deliberately separate from the Next.js application process: media probing and scene detection can consume CPU, disk, and native binaries without competing with web requests.

## Current flow

```text
Studio /api/video/analyses -> POST worker /jobs
worker -> token-gated Studio source endpoint -> ffprobe / FFmpeg
worker -> token-gated Studio callback endpoint -> video-analysis artifact
```

The worker fetches only a job-specific source endpoint, never accepts user URLs, and deletes its own temporary job directory when processing finishes.

## Run

The worker uses the root dependency graph and can be started with:

```bash
REIZO_MEDIA_WORKER_TOKEN=... \
REIZO_MEDIA_APP_URL=http://127.0.0.1:3000 \
npm run media-worker:start
```

Required environment variables:

- `REIZO_MEDIA_WORKER_TOKEN`: shared private token; must match Studio.
- `REIZO_MEDIA_APP_URL`: absolute internal URL of the Studio web service.

Useful optional variables:

- `REIZO_MEDIA_WORKER_HOST`, `REIZO_MEDIA_WORKER_PORT` (default `127.0.0.1:4020`)
- `REIZO_FFPROBE_PATH`, `REIZO_FFMPEG_PATH`
- `REIZO_MEDIA_MAX_DURATION_SECONDS` (default `600`)
- `REIZO_MEDIA_SCENE_THRESHOLD` (default `0.35`)
- `REIZO_MEDIA_MAX_SCENES` (default `30`)
- `REIZO_MEDIA_CONCURRENCY` (default `1`, capped at `4`)

Studio needs `REIZO_MEDIA_WORKER_URL=http://127.0.0.1:4020` plus the same token to dispatch jobs.

## MVP output

FFprobe supplies duration, dimensions, frame rate, and audio presence. FFmpeg's scene score filter produces time boundaries. The built-in fallback writes only time-based structural suggestions and intentionally leaves visual, narration, on-screen-text, shot, and edit fields empty. It does not pretend to have seen or transcribed content.

An ASR/VLM enrichment adapter is the next step, after selecting and evaluating its model-license and privacy requirements. Its normalized output must continue to conform to `src/lib/studio/video-analysis.ts`.

## Open-source adoption record

| Component | Decision | Role |
| --- | --- | --- |
| FFmpeg / ffprobe | adopt | Probe media and identify scene boundaries through stable CLI interfaces. Deployment must review the selected binary build's LGPL/GPL configuration. |
| PySceneDetect | adapt later | Evaluate as a higher-quality scene detector if FFmpeg scores prove insufficient. |
| faster-whisper | adapt later | Isolated ASR sidecar or job runner; evaluate model-weight licenses separately. |
| PaddleOCR / VLM | adapt later | Optional text and visual enrichment only, never part of the Studio artifact contract. |
| Rendiv | reference later | Rendering phase after users approve an original script/storyboard. |
| Elah / OpenCut | reference later | Manual timeline editing only; neither is forked for this MVP. |
