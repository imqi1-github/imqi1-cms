export type CacheClearAction = "all" | "preset" | "keyword" | "search";

export interface CacheClearBody {
  csrfToken: string;
  action: CacheClearAction;
  value?: string;
}

export interface CacheClearResponse {
  success: boolean;
  matched: number;
  cleared: number;
  message?: string;
  note?: string;
}
