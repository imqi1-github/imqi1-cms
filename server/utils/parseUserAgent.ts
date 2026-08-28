// 入口转发：实现在 shared/parseUserAgent（前端/服务端共用），此处仅 re-export 保持
// `#server/utils/parseUserAgent` 旧导入路径可用（server/api/comments.get.ts 等已固定写此路径）。
export { parseUserAgent } from "#shared/parseUserAgent";
export type { ParsedAgent } from "#shared/parseUserAgent";