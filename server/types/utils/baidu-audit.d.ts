export interface BaiduAuditResult {
  conclusion: string;
  conclusionType: number;
  data?: Array<{
    type: number;
    subType: number;
    conclusion: string;
    conclusionType: number;
    msg: string;
  }>;
  error_code?: number;
  error_msg?: string;
}

export interface AuditConfig {
  enabled: boolean;
  apiKey: string;
  secretKey: string;
  checkAdmin: boolean;
}