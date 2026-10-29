# 处置手册

处置前**必须**先把「要动哪几条、动完什么效果」列给用户确认，用户点头再执行。

## 一、为什么优先走后台而不是直接改库

友链/订阅的展示走 ISR 页面缓存，缓存键在 Redis / Nitro cache 里：

- 友链变更 → 失效 `/links`、`/map`
- 订阅变更 → 失效 `/`、`/subscribes`、`/map`

走后台（admin API）会顺带触发 `invalidateContentCaches`，页面缓存与库一起更新；直接改库则缓存里仍是旧页面，访客还能看到已下线的友链。

## 二、推荐路径（后台操作，零风险）

| 处置对象 | 操作路径 | 生效范围 |
| --- | --- | --- |
| 友链 | 后台「友链管理」→ 找到该条 → 关闭启用开关 | 该友链从前台友链页、地图页消失 |
| 订阅 | 后台「订阅管理」→ 删除该订阅源 | 该源全部订阅文章从前台订阅页消失 |

后台操作会写审核日志、失效缓存，最省事。

## 三、API 路径（需要批量/自动化时）

本机 dev 环境（`localhost:3001`）：

```bash
cd "$(git rev-parse --show-toplevel)"
SID=$(bash scripts/audit-shared-session.sh)      # 复用共享会话，别重复登录（单端登录会互踢）
TOKEN=$(curl -s -H "Cookie: session=$SID" http://localhost:3001/api/csrf/token | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p')

# 1) 看当前状态（enabled=true 表示在展示）
curl -s -H "Cookie: session=$SID" http://localhost:3001/api/admin/links

# 2) 禁用友链（该端点是「翻转」语义：true → false）
curl -s -X PATCH "http://localhost:3001/api/admin/links/<id>/toggle" \
  -H "Cookie: session=$SID" -H "Content-Type: application/json" \
  -d "{\"csrfToken\":\"$TOKEN\"}"

# 3) 删除订阅源（DELETE 从 header 取 CSRF）
curl -s -X DELETE "http://localhost:3001/api/admin/subscribes/<id>" \
  -H "Cookie: session=$SID" -H "x-csrf-token: $TOKEN"
```

线上部署站点：把 host 换成站点域名（`https://imqi1.com`）即可，但需要**线上后台的有效会话 cookie**——不要用 dev 的 SID，线上后台另登一次。

注意：
- CSRF token 有效期 1 小时，批量操作前重新取一次。
- `scripts/audit-shared-session.sh` 的 `--renew` 会让其它并行会话的会话失效，慎用。
- 禁用的友链是可逆的（再 toggle 一次即恢复）；删除订阅源是**不可逆**的（级联删掉 `subscribeposts`），删除前先确认。

## 四、处置后复验

```bash
# 线上：确认该友链已不在公开列表
curl -s -H "Referer: https://imqi1.com/" https://imqi1.com/api/links | grep -c "<被处置的域名>"
# 线上：确认订阅文章已消失
curl -s -H "Referer: https://imqi1.com/" https://imqi1.com/api/subscribes | grep -c "<被处置的文章标题>"
```

两条命令都应返回 `0`。缓存是 best-effort 失效，若仍返回非 0，等缓存过期（5 分钟）或让用户在后台手动刷新一次。

## 五、留档

审查报告在仓库外（临时目录）。若要留档，请用户指定位置（建议放在**仓库外**的归档目录，避免违规片段进入项目目录与版本库）。

处置台账建议记：日期、目标（友链/订阅 id + 名称 + 地址）、机审结论、置信度、命中词与风险子类、**百度审核 logId**（机审侧凭证，可回溯查证）、处置动作、执行人。

> 报告里的机审结论是**百度侧的机审结果**，处置台账里如实记录即可；判定依据以报告中的「命中词 + 风险子类 + 上下文」为准，别把机审结论写成法律定性。
