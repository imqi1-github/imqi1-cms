import * as fs from "fs";
import * as path from "path";

import { prisma } from "#server/utils/prisma";
import type { SessionData, SessionStore, SessionStoreType } from "#server/types/utils/session-store";


// 内存存储
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionData>();

  async get(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (session && Date.now() < session.expires) {
      return session;
    }
    if (session) {
      this.sessions.delete(sessionId);
    }
    return null;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    this.sessions.set(sessionId, data);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async clearUserSessions(userId: number): Promise<void> {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expires < now) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

// 文件存储
export class FileSessionStore implements SessionStore {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = path.join(process.cwd(), ".sessions");
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getFilePath(sessionId: string): string {
    // 防御路径穿越：sessionId 来自客户端 cookie，须净化后再拼路径（否则 session=../../package 可读/删任意 .json）
    const safeName = path.basename(sessionId);
    return path.join(this.sessionsDir, `${safeName}.json`);
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const filePath = this.getFilePath(sessionId);
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = fs.readFileSync(filePath, "utf-8");
      const session: SessionData = JSON.parse(data);
      if (Date.now() < session.expires) {
        return session;
      }
      fs.unlinkSync(filePath);
      return null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
    const filePath = this.getFilePath(sessionId);
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
  }

  async delete(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async clearUserSessions(userId: number): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.sessionsDir)) {
      return;
    }
    const files = fs.readdirSync(this.sessionsDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(this.sessionsDir, file);
        try {
          const data = fs.readFileSync(filePath, "utf-8");
          const session: SessionData = JSON.parse(data);
          if (session.userId === userId) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(error);
          // 忽略错误
        }
      }
    }
  }

  async cleanup(): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.sessionsDir)) {
      return;
    }
    const now = Date.now();
    const files = fs.readdirSync(this.sessionsDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(this.sessionsDir, file);
        try {
          const data = fs.readFileSync(filePath, "utf-8");
          const session: SessionData = JSON.parse(data);
          if (session.expires < now) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(error);
          // 忽略错误
        }
      }
    }
  }
}

// 数据库存储
export class DatabaseSessionStore implements SessionStore {
  async get(sessionId: string): Promise<SessionData | null> {
    try {
      const session = await prisma.sessions.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return null;
      }

      if (session.expires < new Date()) {
        await prisma.sessions.delete({ where: { id: sessionId } });
        return null;
      }

      return {
        userId: session.userId,
        authCode: session.authCode,
        expires: session.expires.getTime(),
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    await prisma.sessions.upsert({
      where: { id: sessionId },
      create: {
        id: sessionId,
        userId: data.userId,
        authCode: data.authCode,
        expires: new Date(data.expires),
      },
      update: {
        userId: data.userId,
        authCode: data.authCode,
        expires: new Date(data.expires),
      },
    });
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await prisma.sessions.delete({ where: { id: sessionId } });
    } catch (error) {
      console.error(error);
      // 忽略错误
    }
  }

  async clearUserSessions(userId: number): Promise<void> {
    await prisma.sessions.deleteMany({
      where: { userId },
    });
  }

  async cleanup(): Promise<void> {
    await prisma.sessions.deleteMany({
      where: {
        expires: { lt: new Date() },
      },
    });
  }
}

// 获取存储实例
// 单例必须挂到 globalThis：SSR 渲染（app bundle）与 API handler（nitro bundle）
// 会各自内联一份本模块，模块级变量会被打包成多份独立实例。memory 存储是纯内存
// 单例，多份实例互不可见 → 登录写进 API 那份、SSR 中间件读 app 那份为空，
// 导致 /admin 每次整页进入都被判 session 无效、302 跳登录（见 auth 中间件）。
// file/database 走文件系统/MySQL 天然跨 bundle 共享，故只有 memory 受影响。
// node-server preset 为单进程，globalThis 在同一进程内跨模块图共享。
interface GlobalSessionStore {
  __imqiSessionStore?: SessionStore;
  __imqiSessionStoreType?: SessionStoreType;
}
const globalStore = globalThis as GlobalSessionStore;

// 周期清理过期 session：三处 cleanup() 原本都是死代码（过期项只在再次 get() 时懒清），
// 长期运行会导致 memory Map/.sessions 目录/MySQL sessions 表无限增长。这里按固定间隔触发一次，
// 异步 fire-and-forget，不阻塞鉴权路径。
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟
function maybeCleanupStore(store: SessionStore) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  void store.cleanup().catch(() => {});
}

export async function getSessionStore(): Promise<SessionStore> {
  const config = await getSessionConfig();
  const storeType = config.storeType || "memory";

  if (globalStore.__imqiSessionStore && globalStore.__imqiSessionStoreType === storeType) {
    maybeCleanupStore(globalStore.__imqiSessionStore);
    return globalStore.__imqiSessionStore;
  }

  globalStore.__imqiSessionStoreType = storeType;

  switch (storeType) {
    case "file":
      globalStore.__imqiSessionStore = new FileSessionStore();
      break;
    case "database":
      globalStore.__imqiSessionStore = new DatabaseSessionStore();
      break;
    case "memory":
    default:
      globalStore.__imqiSessionStore = new MemorySessionStore();
      break;
  }

  maybeCleanupStore(globalStore.__imqiSessionStore);
  return globalStore.__imqiSessionStore;
}

// 获取 Session 配置
export async function getSessionConfig(): Promise<{ storeType: SessionStoreType }> {
  try {
    const meta = await prisma.informations.findUnique({
      where: { key: "sessionStoreType" },
    });
    const storeType = (meta?.value as SessionStoreType) || "file";
    return { storeType };
  } catch (error) {
    console.error(error);
    return { storeType: "file" };
  }
}
