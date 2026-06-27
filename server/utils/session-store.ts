import { prisma } from "#server/utils/prisma";
import * as fs from "fs";
import * as path from "path";

export interface SessionData {
  userId: number;
  authCode: string;
  expires: number;
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData): Promise<void>;
  delete(sessionId: string): Promise<void>;
  clearUserSessions(userId: number): Promise<void>;
  cleanup(): Promise<void>;
}

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
    return path.join(this.sessionsDir, `${sessionId}.json`);
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

// 存储类型
export type SessionStoreType = "memory" | "file" | "database";

// 获取存储实例
let currentStore: SessionStore | null = null;
let currentStoreType: SessionStoreType | null = null;

export async function getSessionStore(): Promise<SessionStore> {
  const config = await getSessionConfig();
  const storeType = config.storeType || "memory";

  if (currentStore && currentStoreType === storeType) {
    return currentStore;
  }

  currentStoreType = storeType;

  switch (storeType) {
    case "file":
      currentStore = new FileSessionStore();
      break;
    case "database":
      currentStore = new DatabaseSessionStore();
      break;
    case "memory":
    default:
      currentStore = new MemorySessionStore();
      break;
  }

  return currentStore;
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

// 重置存储实例（配置更改时调用）
export function resetSessionStore(): void {
  currentStore = null;
  currentStoreType = null;
}
