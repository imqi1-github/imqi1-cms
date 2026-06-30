/** parseUserAgent 返回结构 */
export interface ParsedAgent {
  browser: string | null;
  os: string | null;
  browserIcon: string;
  osIcon: string;
}
