export type CacheClearAction = "all" | "preset" | "keyword" | "search" | "footprint";

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
