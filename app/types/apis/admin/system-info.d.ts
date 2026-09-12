/**
 * 管理端系统信息（/api/admin/system-info GET 响应）。
 * 前端 admin/index.vue 的 systemInfo ref 与 $fetch 显式泛型共用此接口。
 *
 * 约定 4:类型放独立文件,与同目录 attachments.d.ts / settings.d.ts 等保持一致。
 */
export interface SystemInfo {
  /** Node.js 进程版本,如 "v22.5.0" */
  nodeVersion: string;
  /** process.platform,如 "linux" / "darwin" / "win32" */
  platform: string;
  /** process.arch,如 "x64" / "arm64" */
  architecture: string;
  /** 进程启动至今的可读时长,如 "3天 7小时 12分钟" */
  uptime: string;
  /** 堆内存使用情况（MB） */
  memory: {
    used: number;
    total: number;
    unit: string;
  };
  /** PostgreSQL 版本字符串（select version() 全串） */
  database: {
    version: string;
  };
  /** 附件库统计 */
  attachments: {
    count: number;
    totalSize: number;
  };
  /**
   * 构建哈希:nuxt.config genBuildHash() 在生产构建期生成（如 20260911191706-a8b68265），
   * 开发环境为 "开发版"。后台仪表盘直接展示,避免依赖 useSiteSettings 走 /api/site 时
   * 因 SPA 跳转 / referer 缺失拿不到值。
   */
  buildHash: string;
  /** 是否运行在容器内（Docker / containerd / K8s / Podman 任一命中即 true） */
  isDocker: boolean;
  /** 部署方式人类可读标签 */
  deploymentType: "docker" | "native";
}