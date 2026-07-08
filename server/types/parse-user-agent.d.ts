/** parseUserAgent 返回结构（服务端版，与前端 app/types/parse-user-agent 保持一致） */
export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  browserIcon: string;
  osIcon: string;
}
