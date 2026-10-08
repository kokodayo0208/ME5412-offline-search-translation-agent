# 本地模型恢复指南

仓库不包含 Ollama 权重，也不会自动下载或执行模型恢复。准备运行环境时，在目标电脑自行选择合规来源并安装：

- 必需：`qwen3:8b`，用于本地问答和翻译。
- 可选：`qwen3-vl:4b-instruct`，用于本地图片/OCR 问答。
- Ollama 默认使用用户自己的模型存储；如使用其他位置，设置 `OLLAMA_MODELS` 环境变量。

安全检查示例（只读，不下载）：

```powershell
ollama list
.\scripts\check-models.ps1 -Required qwen3:8b -Optional qwen3-vl:4b-instruct
```

若模型缺失，请在确认网络、许可证和机构政策后，由用户手动执行适合其环境的 `ollama pull <tag>`。本仓库脚本不会联网、不会改动模型存储，也不会中断正在运行的 Ollama 服务。

## GitHub Release 备份

公开 release `backup-2026-10-08` 的模型 part 是扁平 asset 名称（例如 `model-<blob-sha256>-part001.bin`），下载全部模型 asset、`backup-manifest.json` 以及 `model-metadata-*` asset 到同一个目录后，先重建本地备份布局：

```powershell
node scripts/restore-release-assets.mjs .\release-assets .\.model-backup-release-restored
node scripts/restore-models.mjs .\.model-backup-release-restored D:\staging\models
```

`restore-release-assets.mjs` 会按 manifest 恢复 `blobs/<sha256>/<part>` 和 `metadata/<source>/...` 原始路径，逐个验证大小与 SHA-256，并拒绝缺失、碰撞或不同内容的已有文件。下载工具必须保留 asset 的原始文件名；不要把模型 part 合并或改名。

运行项目时，启动器只使用本机 `127.0.0.1:11434`；模型 tag 可通过环境变量覆盖，但不要把机器绝对路径或权重 blob 提交到仓库。
