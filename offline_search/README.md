# ME5412 离线课件检索器

这是一个只在本机运行的 Node.js 搜索服务，适合开卷考试快速定位课件。它不会联网，不使用 CDN、云端 AI、远程 API 或外部搜索。

双击醒目的 `启动离线课件搜索.cmd` 即可：它会检查 Node/Python，首次自动扫描上一级 ME5412 文件夹及子文件夹里的 `.pdf` 与 `.pptx`，然后启动只监听 `127.0.0.1:8765` 的服务并打开浏览器。也可分别运行 `build-index.cmd` 和 `start.cmd`。索引保存在本目录 `index.json`，断网时照常使用。

PDF 按页、PPTX 按幻灯片提取文字；英文使用词干与 BM25 风格排序，中文使用单字和二字 n-gram。PDF 结果会在网页内打开对应页；PPTX 展示幻灯片文字并可打开原文件。项目只使用 Node 内置模块；PDF 提取需本机 Python 3 + PyMuPDF，PPTX 使用 Python 标准库 ZIP/XML 读取。没有文字层的图片型 PDF 不支持文字检索。

测试：`npm test`。构建索引：`node indexer.js "D:\课程\ME5412"`。
