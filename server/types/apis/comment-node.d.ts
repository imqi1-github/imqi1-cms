import type { ParsedAgent } from "#server/types/parse-user-agent";

// 对外返回的评论树节点：不含 mail/ip/原始 agent 等隐私字段，
// 头像地址由服务端算好，agent 预解析成展示用的 browser/os。
export interface CommentNode {
  coid: number;
  cid: number;
  name: string;
  link: string | null;
  content: string;
  create_time: Date;
  status: number;
  parent_id: number | null;
  avatar: string;
  device: ParsedAgent;
  children: CommentNode[];
  parent_name: string | null;
  location: string;
  isp: string;
}
