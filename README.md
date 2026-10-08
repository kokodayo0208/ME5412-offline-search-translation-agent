# ME5412 离线搜索 / 翻译 agent

这是 ME5412 的离线课件搜索与翻译项目。GitHub display title：**ME5412离线搜索/翻译agent**；repository slug：`ME5412-offline-search-translation-agent`。本仓库为公开备份，任何人都可以下载；公开不改变第三方材料的版权或许可条件。

## 运行

Windows 上先安装 Node.js 18+、Ollama，并准备 `qwen3:8b`（问答/翻译）；`qwen3-vl:4b-instruct` 为可选的本地图像问答模型。双击 [`ME5412离线课件搜索器/启动离线课件搜索.cmd`](ME5412离线课件搜索器/启动离线课件搜索.cmd) 启动独立 UI。它绑定本机回环地址，搜索和模型请求均留在本机；不调用外部 API，不在启动时下载模型。

当前翻译/问答范围以 `笔记版课件/` 的 11 份 PDF 为准。根目录的原始课件、项目作业材料、结构化视觉补充和测试也保留在项目中，但不是 notes-only UI 的检索范围。首次运行会按相对路径扫描课件并重建生成的 `ME5412离线课件搜索器/index.json`；该索引被 `.gitignore` 排除，源文件路径仍以结构化 JSON 的相对路径记录。

```powershell
Set-Location 'ME5412离线课件搜索器'
npm install
npm test
```

## 内容与恢复

上传范围、SHA-256 和逐文件清单见 [`UPLOAD-MANIFEST.md`](UPLOAD-MANIFEST.md)。模型权重不进入 Git 仓库；本地备份/恢复与校验说明见 [`docs/model-backup.md`](docs/model-backup.md)。需要交付模型时，先由用户明确创建 GitHub Release，再把 `.model-backup-release/` 中每个小于 2 GiB 的 part 作为独立 release asset 上传（不要把它们提交到 Git history），并保留 `backup-manifest.json`。目标电脑按 [`docs/model-restoration.md`](docs/model-restoration.md) 或恢复脚本重组校验。没有任何硬编码的用户目录或绝对索引路径。

课件和作业材料是 NUS 课程/相关作者的第三方材料；本项目不声明其版权或再分发授权，请遵守原始材料的版权、课程政策和适用法律。本项目不附带 NUS 课程材料的额外授权。模型备份中的上游模型按其随附元数据和上游许可证（包括适用时的 Apache License 2.0）使用，不将所有文件统称为 MIT 许可。
