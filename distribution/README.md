# ME5412 portable Windows distribution

This directory contains the reproducible builder and runtime helpers for a Windows 10/11 x64 package. The builder copies only the application, the 11 note PDFs, structured knowledge JSON, `node_modules`, a bundled Node executable, and the selected Ollama runtime. It does not copy project assignments, legacy search code, temporary outputs, logs, renders, credentials, or local model weights.

## Build

From the repository root, run:

```powershell
powershell -ExecutionPolicy Bypass -File distribution\build-portable.ps1
```

The default output is `_portable-build\ME5412-portable`; pass `-Destination` to choose another staging directory. `-OllamaSource` may point to a read-only Ollama installation. No network or npm operation is performed by the builder.

## Run

Run `Start-ME5412.cmd` in the staged package. It uses only `runtime\node\node.exe` and `runtime\ollama\ollama.exe`, sets a package-local `OLLAMA_MODELS` directory, starts Ollama on loopback port 11435, starts the app on 18766, and opens the browser when the app is ready. Existing global Ollama services are not stopped or modified.

## Models

`setup-model.cmd` invokes the bundled Node runtime and `setup-model.mjs`. The script accepts a local manifest or the package's `model-release.json`, talks only to GitHub release/API/CDN hosts, resumes safely, refuses to overwrite different files, and verifies every downloaded part and completed blob. It never uses npm, `ollama pull`, or a general web page.

The distribution uses one text model for AI routes: `qwen3:8b`. It handles course Q&A and offline translation. Image OCR is intentionally not included. The model is not committed to Git; `setup-model.cmd` downloads the filtered `qwen3:8b` assets from the public GitHub backup release (about 5.23 GB total) directly into the package-local model store and verifies every part. No other model is downloaded.

The final text-only package is `ME5412-portable-win-x64-v1.1.0.zip` (1,938,371,859 bytes; SHA-256 `C6ADB51268C61277085C524A737738D6406F6EF20F26CAAA49A44B74CE9A94F7`). The package and model setup were structurally checked. Full AI generation was not completed on the build machine because available commit memory was below the safe 8B test threshold; do not interpret the package as a hardware-independent inference guarantee.
