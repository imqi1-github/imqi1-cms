/**
 * 小程序站点配置类型定义。
 *
 * 修改此处字段会同步触发所有引用处的 TypeScript 类型检查，
 * 字段上的 JSDoc 会在 IDE 悬浮提示中展示。
 */
export interface SiteConfig {
  /** 站点名称，用于首页品牌名、分享标题等站点级展示文案 */
  siteName: string
  /** 首页展示配置 */
  home: HomeConfig
}

/** 首页展示配置 */
export interface HomeConfig {
  /** 英文小标题，展示在首页主标题上方 */
  eyebrow: string
  /** 首页主标题，数组中的每一项渲染为一行 */
  titleLines: string[]
  /** 首页主标题下方的描述文案 */
  description: string
  /** 首页主按钮 */
  primaryButton: HomeButtonConfig
  /** 首页次按钮 */
  secondaryButton: HomeButtonConfig
}

/** 首页按钮配置 */
export interface HomeButtonConfig {
  /** 按钮展示文案 */
  label: string
}
