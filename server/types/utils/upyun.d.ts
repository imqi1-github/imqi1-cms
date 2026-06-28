// 又拍云配置接口
export interface UpYunConfig {
  bucket: string; // 服务名称
  operator: string; // 操作员
  password: string; // 密码
  domain?: string; // 绑定域名
}

// 上传结果接口
export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}
