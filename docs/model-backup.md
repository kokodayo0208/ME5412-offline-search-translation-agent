# Local model backup release

`scripts/backup-models.mjs` makes a local, content-addressed backup of Ollama model stores. It reads only `models/blobs`, `models/manifests`, and `models/metadata`; `idkeys` and any similarly named credential directory are skipped. Large blobs are streamed once into sequential 1,900,000,000-byte parts, with SHA-256 recorded for the source, every part, and each restored file. Identical blobs found in multiple stores are kept once while all source-relative references and manifests remain in the manifest.

The generated `.model-backup-release/` directory is intentionally local and must be excluded from Git (the directory contains model weights). It has no network, Ollama, or model API dependency. The backup manifest contains generic source aliases (`source-a`, `source-b`) rather than machine paths.

```powershell
node scripts/backup-models.mjs
# optional: node scripts/backup-models.mjs D:\model-backup C:\path\to\models G:\other\OllamaModels
```

Restore only when explicitly requested, into a user-selected directory (default is the current user's `.ollama/models`):

```powershell
node scripts/restore-models.mjs .model-backup-release
node scripts/restore-models.mjs .model-backup-release D:\staging\models
```

Restoration validates every part and reconstructed SHA-256, rejects traversal paths, refuses to overwrite a different existing file, and never deletes the original backup or source model store. After restoring to `.ollama/models`, `ollama list` can be used as a read-only check; running Ollama itself is outside this release procedure.
