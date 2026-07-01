// 后端 API 基址
// Vite 按 mode 自动加载对应文件：dev → .env.development，prod → .env.production
// 消费方统一从此处导入，勿直接读 import.meta.env
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
