---
name: windows-mcp-cmd-c-msys-pathconv
description: "Windows Git Bash 下 claude mcp add 带 cmd /c 的 stdio MCP 时,/c 被 MSYS 转成 C:/ 致连接失败;用 MSYS_NO_PATHCONV=1 重加或改 JSON"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3787c776-cd5a-4075-9d4a-2c8bc2bba7b4
---

在 Windows + Git Bash 环境用 `claude mcp add <name> --scope user -- cmd /c npx ...` 添加 stdio MCP 时,Git Bash 的 MSYS 路径转换会把参数 `/c` 改写成 `C:/`,导致写进 `~/.claude.json` 的命令变成 `cmd C:/ npx ...`,`claude mcp list` 显示 ✘ Failed to connect(对比正确的 chrome-devtools 是 `cmd /c npx ...`,二者可对照)。

**解法(任选其一)**:
- 重加时前置 `MSYS_NO_PATHCONV=1`:`MSYS_NO_PATHCONV=1 claude mcp add <name> -- cmd /c npx -y <pkg>`(2026-07-23 已用此法把 playwright MCP `--browser msedge` 装到 user scope)
- 或 add 后直接编辑 `~/.claude.json`,把对应 server 的 args 首项从 `C:/` 改回 `/c`

**注意**:MCP server 的工具在 Claude Code 会话启动时才加载,新装的 MCP 即使 `claude mcp list` 显示 Connected,当前会话里也调不到它的工具(mcp__xxx__* 不会出现),需重启会话/重载 MCP 才生效。
