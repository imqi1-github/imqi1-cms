import { Client } from "ssh2";
const conn = new Client();
conn.on("ready", () => conn.exec(process.argv.slice(2).join(" "), (err, stream) => {
  if (err) { console.error(err.message); conn.end(); process.exit(1); }
  let out = ""; stream.on("data", (d) => { out += d.toString(); });
  stream.on("close", () => { console.log(out); conn.end(); });
}));
conn.on("error", (e) => { console.error("connect err:", e.message); process.exit(1); });
conn.connect({ host: process.env.SERVER_HOST!, port: Number(process.env.SERVER_PORT || 22), username: process.env.SERVER_USER || "root", password: process.env.SERVER_PASSWORD });
