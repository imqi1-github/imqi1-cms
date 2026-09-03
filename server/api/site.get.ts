import { defineTypedApiHandler } from "#server/types/typedApi";
import { getSiteSettings } from "#server/utils/siteSettings";

export default defineTypedApiHandler(
  {
    description: "获取站点公共设置",
  },
  async event => {
    setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

    // 构建哈希：非 public（不进 __NUXT__），服务端可读，随本接口下发，
    // 前端 useSiteSettings 缓存成变量供 meta / 页脚 / 后台仪表盘展示。
    const buildHash = useRuntimeConfig().buildHash ?? "";
    // 小程序码是否可用（运行时是否配置了微信小程序凭据）：前端据此隐藏/显示「小程序看」入口
    const miniQrEnabled = Boolean(process.env.WECHAT_MINI_APPID && process.env.WECHAT_MINI_SECRET);

    return {
      success: true,
      data: await getSiteSettings(),
      buildHash,
      miniQrEnabled,
    };
  },
);
