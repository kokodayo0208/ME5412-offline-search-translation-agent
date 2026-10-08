# ME5412 离线课件搜索器

这是一套纯 Node.js、本地运行的开卷考试检索器：PDF 按页、PPTX 按幻灯片建立索引；搜索支持英文词干、中文单字/二字词及 BM25 排序。所有内容和索引都保存在电脑上，服务只绑定 `127.0.0.1`，没有联网代码、CDN、云端 API 或模型下载。

## 使用

1. 考试前安装一次 Node.js 18 或更高版本，并把本文件夹放在所有 ME5412 PDF/PPTX 的同一上级文件夹内。
2. Windows：双击 `启动离线课件搜索.cmd`。
3. macOS：将本文件夹复制到 Mac 后，在终端执行一次 `chmod +x 启动离线课件搜索.command`；此后在 Finder 双击该 `.command` 文件即可。若 macOS 提示安全确认，右键选择“打开”。

每次启动都会重新扫描上级目录，自动更新 `index.json`，打开浏览器。输入完整考题或关键词，点击结果会显示该页文字；PDF 会嵌入并定位到对应页，PPTX 可显示匹配幻灯片文字。图片扫描型 PDF 没有文字层时无法通过文本搜索。

运行 `npm test` 可测试搜索逻辑。手动建索引：`node indexer.js "课件目录"`。手动服务：`node server.js`。


## Local AI / 本地 AI

- Installed model: qwen3-vl:4b-instruct (about 3.3 GB).
- AI Q&A searches course slides first, then answers with source pages.
- Image OCR reads local images and explains questions or diagrams. Images are not uploaded.
- Runtime only connects to 127.0.0.1:11434 and 127.0.0.1:18765. No cloud API is used.
- The launcher never downloads models during exam use.
- 4B is the stable default for RTX 3060 6 GB.
