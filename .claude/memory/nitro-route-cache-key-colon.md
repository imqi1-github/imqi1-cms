# Nitro ISR 页面缓存键是 `nitro:routes:`（冒号）不是 `nitro/routes`（斜杠）

**真实 Redis 页面键 = `nitro:routes:_:<pathFrag>.<hash>.json`（冒号，`_` 为 name 段）。** 凡在做失效/扫描的 pattern 里出现 `/` 一律命中不了。

## 机制（2026-09 生产实测）
Nitro 源码里 routeRules 缓存组是 `group:"nitro/routes"`（**斜杠**），键逻辑 `[base,group,name,key+".json"].join(":")`，`base` 被 `cache:{base:"redis"}` 覆盖成 `redis`。但落库时经 unstorage `normalizeKey`（`redis/drivers/redis.mjs` 的 `p()`→`joinKeys`）：

```js
function normalizeKey(key){ return key.split("?")[0]?.replace(/[/\\]/g,":").replace(/:+/g,":").replace(/^:|:$/g,"")||"" }
```

**它把 `/`、`\` 全部替换成 `:`**。故 `nitro/routes`（斜杠）在 Redis 键里是 `nitro:routes`（冒号）。`base:"redis"` 经 mount 路由被摘掉，故键头无 `redis:` 前缀。

## 坑：`invalidateContentCaches` 全程空转
`server/utils/content-cache.ts` 曾硬编码 `*nitro/routes*`（斜杠）→ 对 `nitro:routes:_:...` **永不命中** → 内容/分类/标签/评论/友链/订阅/日志/旅行/附件/导入/资料的页面失效**全是 0 删除、静默失败**（`void ... .catch` 吞掉）。临床表现：改了内容但 ISR 页不刷新。
而 `admin/cache/clear.post.ts` 用宽松**子串** `*links*`、`*search*` 等，不涉及组分隔符 → 能命中，造成「后台清除能删、自动失效删不掉」的假象。

## 修复（已应用）
`content-cache.ts`：`*nitro/routes*` → `*nitro:routes*`，清全部兜底 `["*nitro/routes*"]` → `["*nitro:routes*"]`。`routeFrag` 的 `links/map/index/category...` 片段不用动（`*nitro:routes*:<frag>*` 与 `nitro:routes:_:<frag>.<hash>.json` 吻合）。`/map` 与 `/sitemap`（`sitemapxml`）因 `:map`/`:sitemap` 前缀不同不会互撞。

## 排查要点
- 验证真实键：服务器本机 `redis-cli -n <db> --scan --pattern '*nitro:routes*'`（生产 Redis 常为 127.0.0.1 / DB0，无 .env，由启动脚本注入或默认；别在这台开发机假设能连生产 Redis）。
- 若日后键前缀再变（Nitro/unstorage 升级），**先实扫 Redis 键再改**，别只看 nitro 源码（源码是斜杠、落库是冒号，极易误导）。
- 相关：键 0-命中问题同样解释了「构建一致是旧 hash/友链是 Nginx 缓存」等现象——先排除这里。
