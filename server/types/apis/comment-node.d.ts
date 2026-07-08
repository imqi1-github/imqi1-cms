import type { ParsedAgent } from "#server/types/parse-user-agent";

// 评论查询结果类型（对应 findMany select 字段，仅服务端内部使用）
export interface CommentRow {
  coid: number;
  cid: number;
  name: string;
  mail: string | null;
  link: string | null;
  content: string;
  create_time: Date;
  status: number;
  parent_id: number | null;
  agent: string | null;
  ip: string | null;
}

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
