# IPDB 使用与维护文档

本文档说明项目中 `qqwry.ipdb` 的用途、生成/维护流程，以及相关命令的使用方式。

## 作用

项目使用 `data/qqwry.ipdb` 查询 IP 归属地和运营商，主要用于：

- 评论、访客等 IP 的归属地展示
- 访客分布统计中的省市解析
- 本地命令行批量查询 IP

## 相关命令

### 查询 IP

```bash
bun run get:ip 1.2.3.4 1.2.3.5
```

输出格式：

```text
IP    归属地    运营商    网段
```

示例：

```bash
bun run get:ip 114.114.114.114 8.8.8.8
```

### 从 CZDB 转换为 IPDB

命令：

```bash
bun run ipdb:convert -- --ipv4 ./data/ipv4.czdb --ipv6 ./data/ipv6.czdb --key-env CZDB_KEY --output ./data/qqwry.ipdb
```

用途：把 CZDB 的 IPv4/IPv6 数据转换为项目使用的 `qqwry.ipdb`。

常用参数：

| 参数 | 说明 |
|---|---|
| `--input <file>` | 添加一个 CZDB 文件，脚本会自动识别 IPv4/IPv6，可重复传入。 |
| `--ipv4 <file>` | 指定 IPv4 CZDB 文件。 |
| `--ipv6 <file>` | 指定 IPv6 CZDB 文件。 |
| `--output <file>` | 输出 IPDB 路径，默认 `data/qqwry.ipdb`。 |
| `--key <key>` | 直接传 CZDB base64 key。不推荐，会进入 shell 历史。 |
| `--key-env <name>` | 从环境变量读取 CZDB key，默认 `CZDB_KEY`。 |
| `--verify <none\|sample\|full>` | 校验生成结果，默认 `sample`。 |
| `--sample <ip>` | 生成后额外查询样本 IP，可重复传入。 |
| `--allow-single-family` | 允许只输出 IPv4 或只输出 IPv6。默认要求 IPv4/IPv6 都存在。 |
| `--ignore-expired` | CZDB 头部过期时仍继续处理。 |
| `--dump-raw-regions <n>` | 写入前打印前 n 条原始区域字符串，便于调试解析。 |

推荐用环境变量传 key：

```bash
CZDB_KEY='你的 CZDB key' bun run ipdb:convert -- --ipv4 ./data/ipv4.czdb --ipv6 ./data/ipv6.czdb
```

### 合并 IPv4 IPDB 与 IPv6Wry

命令：

```bash
bun run ipdb:merge-ipv6wry
```

用途：把 IPv4 IPDB 和 `ipv6wry.db` 合并成同时支持 IPv4/IPv6 的 `qqwry.ipdb`。

默认输入：

- IPv4 IPDB：优先 `data/qqwry2.ipdb`，不存在则用 `data/qqwry.ipdb`
- IPv6 数据库：`data/ipv6wry.db`
- 输出：`data/qqwry.ipdb`

常用参数：

| 参数 | 说明 |
|---|---|
| `--ipv4-ipdb <file>` | 指定 IPv4 源 IPDB。 |
| `--ipv6wry-db <file>` | 指定 IPv6Wry 数据库。 |
| `--output <file>` | 指定输出 IPDB，默认 `data/qqwry.ipdb`。 |
| `--no-verify` | 跳过生成后的校验。 |
| `--sample <ip>` | 生成后额外查询样本 IP，可重复传入。 |

示例：

```bash
bun run ipdb:merge-ipv6wry -- --ipv4-ipdb ./data/qqwry2.ipdb --ipv6wry-db ./data/ipv6wry.db --output ./data/qqwry.ipdb
```

> ipv6wry 可从 obaby 的仓库下载。

### 简化 IPDB

命令：

```bash
bun run ipdb:simplify
```

用途：读取现有 IPDB，规范和压缩归属地/运营商字段，再重新写出。默认会覆盖 `data/qqwry.ipdb`。

默认行为：

```bash
bun tsx scripts/simplify-ipdb.ts --input data/qqwry.ipdb --output data/qqwry.ipdb
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--input <file>` | 源 IPDB，默认 `data/qqwry.ipdb`。 |
| `--output <file>` | 输出 IPDB，默认与输入相同。 |
| `--no-verify` | 跳过生成后的校验。 |
| `--sample <ip>` | 生成后额外查询样本 IP，可重复传入。 |

示例：

```bash
bun run ipdb:simplify -- --input ./data/qqwry.ipdb --output ./data/qqwry.ipdb
```

建议先输出到临时文件确认：

```bash
bun run ipdb:simplify -- --input ./data/qqwry.ipdb --output ./data/qqwry.simplified.ipdb
QQWRY_IPDB_PATH=./data/qqwry.simplified.ipdb bun run get:ip 114.114.114.114 8.8.8.8
```

确认无误后再替换正式文件。
