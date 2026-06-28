// COS配置接口
export interface CosConfig {
  SecretId: string;
  SecretKey: string;
  Bucket: string;
  Region: string;
}

// 上传结果接口
export interface CosUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// 删除结果接口
export interface CosDeleteResult {
  success: boolean;
  error?: string;
}