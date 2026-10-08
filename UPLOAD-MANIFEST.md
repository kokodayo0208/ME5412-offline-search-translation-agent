# Upload manifest

Prepared 2026-10-08 from the existing workspace. Paths are repository-relative; sizes are bytes; hashes are SHA-256. This is the intended private upload set. Generated indexes, logs, dependency trees, temporary renders, and model weights are excluded by design.

## Included files

| path | bytes | sha256 |
|---|---:|---|
| `ME5412 0. Briefing & Intro to Healthcare Robotics.pdf` | 851181 | `69da273d58b4a0a949dd40749e27314bde7004471fceee50cedffa4819db571b` |
| `ME5412 1. Principles Assistive Technology.pdf` | 9333949 | `b32bcc2a5801c10105de95647cdc8a2f8adb0c76332bb24a27f98ca43a89c861` |
| `ME5412 2. Mobility aids.pdf` | 2467671 | `a8784ba9401245ee190ff92f574ee90e021080d0e93417ab53fa5e9a811532c7` |
| `ME5412 3. Assistive Technology Interfaces.pdf` | 2085481 | `01f17759280b7ffc3b569c02c1ee6d62a3d718f0ab92c944c0b44041045c8ed5` |
| `ME5412 4. Anatomy SCI assessment.pdf` | 3015947 | `501bc7cfad48bd7473bdb0bb33ab2e8541baa768d3fdda36398c8259bf399027` |
| `ME5412 5. Manipulation aids.pdf` | 6439712 | `7c962a73ccf5adbf6fec3e5aa8f9effc2d3ea28d896a9874fe57e31d3d168385` |
| `ME5412 6. Interaction Control.pdf` | 3181355 | `2b6b88d5924c80422762c532d6efb47f30ac4191019b89c945cccd581941c79f` |
| `2.0 ME5412 Part 2 Introduction.pdf` | 7325499 | `6317d2eabecdd18202ee73e826519c438727ad5be75fb3d518172db1edc63ba2` |
| `2.1 ME5412 Stroke and Stroke Rehabilitation.pdf` | 5860168 | `5a9889549212e2164ec6ff180aae313c05dee8b14344160a20b7802f88f46d93` |
| `2.2 ME5412 Lower limb robotics.pdf` | 16564886 | `f6333b0cb8e9397fec4a6c969de07e3546bc22d7a8b677e21c76b2bd729a1b3c` |
| `2.3. ME5412 Upper limb rehab robotics.pdf` | 41755403 | `5ba68435161c64ef639d3e6fc8fa912268a51fa1ba5607b0e86a7e417441cdc1` |
| `笔记版课件/2.0 ME5412 Part 2 Introduction.pdf` | 8382532 | `43839d0ca32c58d22d7ff8d73ac44a2d0821f3df724c0d8b54e754a1d115e381` |
| `笔记版课件/2.1 ME5412 Stroke and Stroke Rehabilitation.pdf` | 10770274 | `53cfbed79dd3c3b3039fd1d857f9dd8c6cd481941837958056857f748151bb07` |
| `笔记版课件/2.2 ME5412 Lower limb robotics.pdf` | 23927333 | `1b748cce6b7a3b6dc09b06c17e9d8acc95387c6119ba83675dab2ccd69febfe1` |
| `笔记版课件/2.3. ME5412 Upper limb rehab robotics.pdf` | 16653561 | `5852fd517d49b5810eb79aa4207c12b52d96b417d67167c564c9861b5c57c237` |
| `笔记版课件/ME5412 0. Briefing & Intro to Healthcare Robotics.pdf` | 1324407 | `8f4b0bf459fabf726b46de3fac15f7d3b7cfa4bf48d4f46ec79bcd8bfe319fe4` |
| `笔记版课件/ME5412 1. Principles Assistive Technology.pdf` | 19792232 | `ee9dadfd138e0fbc221c68c56005a40724a12aaed27d41e0eee5c5f33caa5259` |
| `笔记版课件/ME5412 2. Mobility aids.pdf` | 6549850 | `478874986675f719e73a26594906d87035db0c24969b9a5077485bd198e0caf` |
| `笔记版课件/ME5412 3. Assistive Technology Interfaces.pdf` | 4972383 | `afdd0a0bb9704283ea06272ffeb5b94c0280baeeaa8ab051ce09b2bb7f0819c8` |
| `笔记版课件/ME5412 4. Anatomy SCI assessment.pdf` | 7560946 | `c77c54073ef53f4602ca7624e1dd0245ed7f49fde3fedff6a2f19866a096b7f2` |
| `笔记版课件/ME5412 5. Manipulation aids.pdf` | 13929786 | `0cc95f1e3b15808b22eb276c6a04e7b5e4d821f1585fe5f5ce9c5fa01878dbef` |
| `笔记版课件/ME5412 6. Interaction Control.pdf` | 11834702 | `25edad99c8af32357b8a628284579e903932fb2709fd573170d1d96def2d568e` |
| `ME5412_中英双语课件目录大纲.docx` | 53583 | `432debe2d88af0377e780ee865bc25f09e506eded24cbfc9adbdcb77d78ba7ff` |
| `project/ME5412-2026 Project Assignment Briefing.pptx` | 1324079 | `2216e01070942bbed1a8db347ba53155a7f2a4b000753aaad87f6a40df2ea0d1` |
| `project/Robots developed at NUS Biorobotics Lab.pdf` | 16286148 | `450b2cc17904750040f4711398c4a3ea81812a64d35d6f9b241112a83b4e7c04` |

The application source/config/tests and structured knowledge are included as the complete non-generated set under `ME5412离线课件搜索器/`: `app.html`, `ask-lifecycle.js`, `audit_visual_reviews.js`, `control_knowledge_audit.json`, `corrections.json`, `indexer.js`, `package-lock.json`, `package.json`, `part2_visual/*.json`, `README.md`, `search.js`, `search.passages.test.js`, `server.js`, `start_ollama.ps1`, `start_ollama_warmup.mjs`, `start_server.ps1`, `test/*.test.js`, `visual_supplements.json`, and `启动离线课件搜索.cmd`.

## Model metadata (not included)

No model blob is uploaded or hashed by content. The existing local Ollama blob filenames and sizes were recorded without reading the 8.52 GB payloads:

```text
sha256-16b83be682148a4d8201dbf720ea7eace5de98b69f63f05e0c908b4d7977ecb5  3295612928
sha256-a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f  5225374496
```

Other small Ollama metadata blobs remain local. Restore tags using [`docs/model-restoration.md`](docs/model-restoration.md); never commit `.ollama/`, `*.gguf`, or `*.safetensors`.
