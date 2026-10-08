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

运行项目时，启动器只使用本机 `127.0.0.1:11434`；模型 tag 可通过环境变量覆盖，但不要把机器绝对路径或权重 blob 提交到仓库。
