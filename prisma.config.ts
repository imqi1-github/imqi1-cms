import "dotenv/config";
import { defineConfig } from "prisma/config";

// 运行时用拆分的 DB_* 变量
const buildDatabaseUrl = () => {
  const host = process.env["DB_HOST"] || "localhost";
  const port = process.env["DB_PORT"] || "5432";
  const user = process.env["DB_USER"] || "postgres";
  const password = process.env["DB_PASSWORD"] ?? "";
  const database = process.env["DB_NAME"] ?? "";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // schema.prisma 的 datasource 未写 url，连接串由此注入。
    // prisma studio / db execute 等需连库的命令依赖它，勿删。
    url: buildDatabaseUrl(),
  },
});
