# ME5412 Offline Agent — User Guide

This guide is for the Windows 10/11 x64 portable package. The package contains the application, `course-notes`, the search index, Node.js, Ollama, and the scripts required to install and run the single `qwen3:8b` text model. End users do not need to install development tools or download dependencies from another website.

## 1. Download and install

1. Open the [GitHub Releases page](https://github.com/kokodayo0208/ME5412-offline-search-translation-agent/releases) and download the portable Windows ZIP. The source-code ZIP is not the runnable package.
2. Extract the ZIP to a short writable directory, for example `D:\ME5412-offline-agent`.
3. Confirm that the extracted directory contains `Start-ME5412.cmd`, `setup-model.cmd`, `runtime\node\node.exe`, `runtime\ollama\ollama.exe`, `app\`, `course-notes\`, and `data\`.
4. While GitHub is reachable, double-click `setup-model.cmd`. It streams the single `qwen3:8b` model from this repository's Release assets, verifies size and SHA-256, and stores the result under the package's own model directory. It does not call `npm install`, `ollama pull`, or another download site.
5. Wait for the final success message. If the download is interrupted, run the same command again; verified parts are reused. Do not rename, merge, or delete individual parts during setup.
6. Double-click `Start-ME5412.cmd` after setup succeeds.

The first setup requires Internet access to GitHub. Once the model has been verified, the normal application workflow is designed to run offline.

## 2. Hardware guidance

Recommended: Windows 10/11 64-bit, a modern 6–8 core CPU with AVX2, 32 GB RAM, 8 GB or more VRAM, an SSD, and at least 25 GB free space. A 16 GB RAM / 6 GB VRAM computer may run with reduced concurrency after other heavy programs are closed, but this is a restricted configuration. CPU-only execution may be much slower.

The model's 8B parameter label is not a RAM requirement. Runtime memory also includes model weights, context/KV cache, Ollama, Node.js, the operating system, and the course index. Do not treat these recommendations as an official performance guarantee.

## 3. Using the interface

The interface labels are currently Chinese:

| Chinese label | Meaning | Action |
| --- | --- | --- |
| 关键词课件搜索 | Course search | Search indexed course notes |
| 图片识字 | Removed | Not available in this release |
| 离线翻译 | Offline translation | Translate text with the local model |
| 搜索课件 | Search course materials | Run the course search |
| 生成答案 | Generate answer | Ask the local model to explain using retrieved context |

Search results identify the relevant course file and page. The preview and answer-output areas are kept visible together so that the source can be checked before relying on an explanation. Search and translation maintain separate interface state and may be switched independently.

The package uses a private local Ollama port and does not need to stop an Ollama installation already running on the computer. If a port conflict is reported, close the conflicting process or change the package configuration only as documented by the release.

## 4. WeChat screenshot OCR

This release intentionally uses one text model and does not include a vision model or built-in OCR. To extract text from a screenshot, use WeChat's screenshot tool and its “Extract text” option, copy the result, and paste it into the course search or translation box.

WeChat's OCR feature, login state, language support, and offline behavior vary by version. It is optional and not required to run this agent. Test the feature while online before relying on it offline. Do not send copyrighted course screenshots to a cloud service merely to use this tool.

## 5. Offline smoke test

After setup reports success:

1. Start the program once while online and wait for the local page to load.
2. Search for a distinctive course phrase and confirm that a source file and page are shown.
3. Open the preview and confirm that the answer area remains present.
4. Generate one short answer and translate one short paragraph.
5. Disconnect from the Internet and repeat search, answer generation, and translation.

The release validation record should state which of these steps were actually completed. A local model can still make a wrong course judgment; always compare its explanation with the cited course page.

## 6. Troubleshooting

**The terminal remains at “Loading qwen3:8b”.** Confirm setup success, close browsers and other AI tools, check free RAM and disk space, and start again from the extracted package directory.

**Node.js or Ollama is missing.** Re-extract the complete portable ZIP. Do not replace the bundled runtime with files downloaded from another site.

**Model setup stops part way through.** Run `setup-model.cmd` again. It verifies existing parts and resumes missing or incomplete parts.

**The page opens but no answer appears.** First confirm that course search returns a source page, then check that the local model setup finished successfully. A source search result does not require model generation; answer generation and translation do.

**The PDF preview looks black or incomplete.** Use the displayed file/page location and open the PDF with a local PDF viewer if necessary. The screenshots in this repository document layout, not PDF-rendering behavior on every browser.

**SmartScreen or antivirus warns.** Verify that the ZIP came from this repository's Release page and compare its SHA-256 with the release checksum. Do not disable security controls when the download origin cannot be verified.

## 7. Copyright and permitted use

**The course PDFs, notes, screenshots, and course-specific summaries are copyrighted. Copyright belongs to NUS, the original lecturers/authors, and other applicable rights holders. This repository is for personal, non-commercial study only. Commercial use is strictly prohibited, including selling or renting the materials, paid tutoring or training, commercial redistribution, product integration, or use in a commercial hosted service. Downloading a public archive does not transfer copyright or grant a commercial license. Do not remove copyright notices.**

The application code, `qwen3:8b`, Node.js, Ollama, and third-party dependencies are governed by their own licenses. Those licenses are separate from and do not weaken the restrictions on the course materials. This notice is not legal advice.
