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
