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

Model weights are intentionally not staged by this repository builder. The public release manifest and asset map are the source of truth; setup downloads each part directly into the package-local model store and removes owned temporary files after verification.
