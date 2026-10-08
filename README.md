# ME5412 离线搜索 / 翻译 agent

这是一个面向 Windows 10/11 x64 的 ME5412 课件本地搜索、翻译与问答工具。推荐给普通用户的交付形式是 GitHub Release 中的便携 ZIP：Node.js、Ollama、所需运行库、许可证文件、应用、知识库和 11 份“笔记版课件”PDF 都由发布包提供。用户不需要单独安装 Node.js、Ollama、npm，也不需要访问其他网站下载依赖或模型。

已确认的便携资产：[`ME5412-portable-win-x64-2026-10-08.zip`](https://github.com/kokodayo0208/ME5412-offline-search-translation-agent/releases/download/offline-agent-windows-v1.0.0/ME5412-portable-win-x64-2026-10-08.zip)，大小 1,938,370,813 bytes，SHA-256 `8F52C471F7609A521C6E01899D8DF2D55AB85438FFADF9DF362EC24DD9928161`。Release 标签为 `offline-agent-windows-v1.0.0`。

## 普通用户从哪里开始

1. 从本仓库的公开 GitHub Release 下载构建者确认过的便携 ZIP（无需 GitHub 账号）。源码 ZIP 不是便携运行包；不要用源码 ZIP 代替带 runtime 的资产。
2. 解压到较短、可写、非 `Program Files` 的目录，例如 `D:\ME5412-portable`。不要覆盖已有安装。
3. 在仍能稳定访问 GitHub 的网络环境中双击 `setup-model.cmd`。它只从本项目 GitHub API 和 Release asset 主机获取模型资产，支持中断后继续，并验证每个分片和完整文件的大小与 SHA-256。
4. 配置完成后双击 `Start-ME5412.cmd`。浏览器打开本机 `http://127.0.0.1:18766/`；搜索、翻译、问答和模型请求均留在本机。

首次模型配置需要网络；完成后可断开网络继续使用。模型文件较大，请预留至少 20 GB 可用磁盘空间和 16 GB 内存；当前 `qwen3:8b` 与 `qwen3-vl:4b-instruct` 两个模型的去重后合计下载量约 8.5 GB，确切大小以发布清单为准。视觉模型是否随包配置以最终清单为准。模型生成的答案仍需结合课件原文核对，离线运行不等于答案一定正确。

完整的新手步骤、断点续传、端口和安全排查见 [`docs/userguide.md`](docs/userguide.md)。

## 开发者与内容说明

源码是可选的开发者路径，不是普通用户的安装前置条件。仓库中的 `distribution/` 脚本用于构建便携包；本页记录的资产名称、下载 URL、模型清单、许可证和校验值对应已确认的 Release。

应用只面向便携包内的 `app/` 与 `笔记版课件/` 内容；不要把根目录历史材料、作业、旧版程序或临时输出当作便携应用内容。课件和作业材料属于 NUS 课程及相关作者的第三方材料，本项目不声明额外版权或再分发授权。模型按其上游许可证和随附元数据使用，不把所有文件统称为 MIT 许可。

仓库地址：<https://github.com/kokodayo0208/ME5412-offline-search-translation-agent>
