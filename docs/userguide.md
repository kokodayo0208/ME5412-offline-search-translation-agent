# ME5412 便携包用户指南（Windows 10/11 x64）

本指南适用于构建者确认过的 Windows x64 便携 ZIP。便携包应已经包含应用、知识库、11 份“笔记版课件”PDF、Node.js 运行时、Ollama CLI/运行库和许可证文件。普通用户不必安装开发工具，也不必手动找依赖。

## 1. 下载和解压

从公开仓库的 GitHub Release 下载构建者确认的 ZIP：

- 仓库：<https://github.com/kokodayo0208/ME5412-offline-search-translation-agent>
- Release 标签：`offline-agent-windows-v1.0.0`
- 便携 ZIP：[ME5412-portable-win-x64-2026-10-08.zip](https://github.com/kokodayo0208/ME5412-offline-search-translation-agent/releases/download/offline-agent-windows-v1.0.0/ME5412-portable-win-x64-2026-10-08.zip)
- 文件大小：1,938,371,197 bytes
- SHA-256：`99E825E2899296423FB2F68E10B5C6BC9F9CD43AF84C7B04908FEAF649697E20`

无需 GitHub 账号。只从上述仓库的 Release 下载；不要为了 Node.js、Ollama、npm、模型或 PDF 访问其他网站。源码 ZIP 只包含源码，不是带 Node/Ollama runtime 的便携包。本次发布提供单个完整 ZIP，不需要分卷或 bootstrap 拼接。

把 ZIP 解压到短路径和可写目录，例如 `D:\ME5412-portable`，不要解压到 `C:\Program Files`、同步盘或只读位置。解压后应能看到 `Start-ME5412.cmd`、`setup-model.cmd`、`runtime\node\node.exe`、`runtime\ollama\ollama.exe`、`app\`、`data\` 和 `README.md`。

Windows SmartScreen 或杀毒软件提示时，不要按指南绕过安全警告。先核对下载来源、发布资产校验值、数字签名（若发布者提供）和许可证；如仍有疑问，停止运行并联系发布者/机构管理员。构建者负责发布前的运行库来源、许可证和校验记录。

## 2. 第一次模型配置（需要 GitHub 网络）

1. 确认磁盘至少有约 20 GB 可用空间、内存至少 16 GB；大型模型的实际空间以发布清单为准。
2. 在解压目录双击 `setup-model.cmd`。
3. 程序只访问本项目 GitHub Release 所需的 API、GitHub 和 GitHub Release asset 主机；不会调用 npm，不会执行 `ollama pull`，不会从通用网页选取下载源。
4. 等待终端显示各文件已验证完成。网络中断后可以再次运行同一个命令，它会复用已验证文件、继续未完成的部分，并拒绝覆盖内容不同的已有文件。

当前发布清单的模型为 `qwen3:8b` 与 `qwen3-vl:4b-instruct`；两者去重后的合计下载量约 8.5 GB（不是 `qwen3:8b` 单体大小），确切大小以最终清单为准。视觉模型是否安装以最终发布清单为准；若未包含它，则只下载清单中的必需模型。模型放在包内 `data\models`，不建立第二份长期分片缓存。不要把模型权重提交回 Git 仓库。发布者尚未完成真实模型推理验证前，不得把安装成功描述为“所有问答/翻译均已通过测试”。

只有看到验证成功后，才算第一次配置完成。此时可以断开网络；之后的搜索、课件定位、翻译和问答不需要联网。

## 3. 日常启动和使用

双击 `Start-ME5412.cmd`。启动器使用包内的 `runtime\node\node.exe` 和 `runtime\ollama\ollama.exe`，将 Ollama 绑定到 `127.0.0.1:11435`，应用绑定到 `127.0.0.1:18766`，并把模型目录固定为包内 `data\models`。它不会停止、覆盖或改动电脑上已有的 Ollama 服务（例如 `11434`）。

浏览器打开后：

- 在搜索框输入关键词或完整问题，直接定位 11 份本地 PDF 的相关页。
- 可选择本地翻译，分别指定输入语言和目标语言；切换语言后，预览和答案区应保留当前选择并更新结果。
- 问答会先使用课件检索结果，再由本地模型生成回答；请打开来源页核对，不要把模型回答当作课程或医疗建议。
- 视觉/OCR 问答只有在已安装可选视觉模型且发布包支持该功能时可用。

## 4. 完全离线证明

第一次配置完成后，可暂时断开网络再启动 `Start-ME5412.cmd`，检查搜索和已配置的翻译/问答是否仍可用。浏览器地址应为 `127.0.0.1`；应用不需要外部 API。断网测试只能证明本地路径可运行，不能证明每个模型回答准确，也不能替代来源页核对。

## 5. 故障排查

**一直 Loading 或启动超时**：确认已运行 `setup-model.cmd` 并看到验证成功；确认包目录可写且没有被云同步/杀毒软件锁定。关闭窗口后重新运行 `Start-ME5412.cmd`。不要改用外部下载或 npm 安装来“补齐”文件。

**提示 runtime/node.exe 或 Ollama 找不到**：重新从构建者确认的 ZIP 解压到一个全新、短且可写的目录；确认 `runtime\node\node.exe` 和 `runtime\ollama\ollama.exe` 存在。不要从网上下载替代文件覆盖包内运行时。

**端口冲突**：本包使用应用 `18766` 和包内 Ollama `11435`，不会要求停掉现有 `11434` 服务。先关闭另一个占用 `18766`/`11435` 的程序，或请管理员处理端口策略；不要杀掉不属于本包的 Ollama 服务。

**模型磁盘空间不足**：释放空间后重新运行 `setup-model.cmd`。已验证文件会保留，未完成临时文件会被安全清理；不要手动改名、合并或移动模型分片。

**第一次配置时没有网络**：这是预期限制。把整台电脑或包目录搬到可访问 GitHub 的网络环境完成一次配置，再带回离线环境；不要访问其他镜像或网页自行下载。

**SmartScreen/杀毒软件警告**：不要按“绕过”或关闭安全功能。核对官方 GitHub Release、校验值、发布者签名和许可证；无法确认时停止并联系发布者。

## 6. 可选的开发者恢复路径

普通用户不需要手工恢复模型。若构建者或管理员确实需要从同一 GitHub Release 恢复，必须使用仓库现有的 `scripts\restore-release-assets.mjs` 和 `scripts\restore-models.mjs`，配合 `model-release.json`/manifest，保留 GitHub asset 原名并逐项验证 SHA-256，再放入包内 `data\models`。这不是日常安装步骤，也不能成为访问其他网站或执行 `ollama pull` 的理由。模型上游权利、许可证和 NUS 课件标签必须随发布记录保留。

如需开发源码，请先阅读仓库内开发者文件；普通用户不要运行 `npm install`、CI 下载、全局 Ollama 命令或旧版启动器。
