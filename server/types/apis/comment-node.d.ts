// 评论查询结果类型（对应 findMany select 字段）
export interface CommentItem {
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

// 带 children 和额外字段的评论树节点
export interface CommentNode extends CommentItem {
  children: CommentNode[];
  parent_name: string | null;
  location: string;
  isp: string;
}
