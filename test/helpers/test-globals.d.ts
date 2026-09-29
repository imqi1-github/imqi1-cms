// 给 test 用:扩展 globalThis 类型,让 Nuxt 运行时注入的实例属性有类型。
// 解决 test 里 typeof globalThis.$fetch → TS2339 "Property '$fetch' does not exist" 的报错。
// 文件只在 test/tsconfig.json 的 include 里被扫到,不污染 app/server 代码。
import type { $Fetch } from "ofetch";

declare global {
  // Nuxt 把 $fetch 挂在 globalThis 上作为 $Fetch 实例(运行时必有,非可选)。
  // 测试里 mock 这个属性,声明非可选让 TS2339 消失,又不会让 app 端触发 TS18048。
   
  var $fetch: $Fetch;
}

export {};
