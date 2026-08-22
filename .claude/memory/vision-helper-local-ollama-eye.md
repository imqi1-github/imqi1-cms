---
name: vision-helper-local-ollama-eye
description: 给纯文本模型(deepseek-v4-flash)借眼睛的本地方案：vision-helper 子 Agent + vision-local MCP + Ollama qwen2.5vl
metadata: 
  node_type: memory
  type: project
  originSessionId: 6dd424b3-dea1-444e-b139-8c4f67d50197
---

给纯文本主模型（settings.json 全槽位 deepseek-v4-flash，走 api.deepseek.com/anthropic 代理）"借眼睛"的免费本地方案（2026-08-16 装，参考 zhheo 的 zcode-deepseek-eye 思路）。

**架构（三个文件，均为全局）**：
- `~/.claude/agents/vision-helper.md` —— 视觉子 Agent，靠 `mcp__vision-local__describe_image` 看图（不依赖自身模型有视觉，绕开路由限制）
- `~/.claude/CLAUDE.md` —— 路由规则：主模型能直接看到图就自己处理，只能看到路径/`[Unsupported Image]` 就委派 vision-helper
- `~/.claude/mcp-servers/vision-local/vision_local.py` + 全局 mcpServers 注册（command: python）—— 纯标准库 stdio MCP，暴露 `describe_image(image_path)`，base64 后 POST Ollama `/api/generate`

**Why:** 当前所有模型槽位都映射 deepseek-v4-flash（纯文本），`Read` 读图返回 `[Unsupported Image]`，无原生视觉；zai-mcp-server(智谱 GLM-4V)已装但账户 429 余额不足。

**How to apply:**
- 视觉模型 = Ollama `qwen2.5vl:3b`（注意：**Ollama 名字无连字符** `qwen2.5vl`，写成 `qwen2.5-vl` 拉取报 `file does not exist`；RTX 3060 6GB 可跑）
- Ollama serve 须在后台运行，否则 describe_image 连接失败；手动 `ollama serve`，重开机后需重开（或设开机自启）
- 新装 MCP 需**重启 Claude Code 会话**才加载工具；全局 CLAUDE.md/agents 启动时读取
- 踩坑：Windows 下 MCP stdio 输出必须 `sys.stdout.reconfigure(encoding="utf-8")`，否则 GBK 写管道，工具描述/结果乱码
- 备份在 `~/.claude.json.bak_vision`；想换模型改 mcpServers 里 vision-local 的 `env.OLLAMA_VISION_MODEL`
