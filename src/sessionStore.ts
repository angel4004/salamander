import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

export type ConversationRole = "user" | "assistant";
export type ChatUxMode = "human" | "qa";

export interface ConversationTurn {
  role: ConversationRole;
  content: string;
  createdAt: string;
}

interface SessionMetadata {
  firstName?: string;
  userId?: number;
  username?: string;
}

interface StoredSession {
  messages: ConversationTurn[];
  gatewaySessionId?: string;
  uxMode?: ChatUxMode;
  metadata?: SessionMetadata;
  updatedAt: string;
}

type SessionMap = Record<string, StoredSession>;

export class SessionStore {
  private readonly filePath: string;
  private readonly maxTurns: number;
  private readonly sessions: SessionMap;

  constructor(filePath: string, maxTurns: number) {
    this.filePath = filePath;
    this.maxTurns = maxTurns;

    mkdirSync(dirname(filePath), { recursive: true });
    this.sessions = this.load();
  }

  clear(chatId: string): void {
    delete this.sessions[chatId];
    this.persist();
  }

  getHistory(chatId: string): ConversationTurn[] {
    return this.sessions[chatId]?.messages ?? [];
  }

  getUxMode(chatId: string): ChatUxMode {
    return this.sessions[chatId]?.uxMode ?? "human";
  }

  setUxMode(chatId: string, uxMode: ChatUxMode): void {
    const session = this.sessions[chatId] ?? {
      messages: [],
      updatedAt: new Date(0).toISOString()
    };

    session.uxMode = uxMode;
    session.updatedAt = new Date().toISOString();
    this.sessions[chatId] = session;
    this.persist();
  }

  getOrCreateGatewaySessionId(chatId: string, prefix = "openclaw-audit-chat"): string {
    const session = this.sessions[chatId] ?? {
      messages: [],
      updatedAt: new Date(0).toISOString()
    };

    if (!session.gatewaySessionId) {
      session.gatewaySessionId = `${prefix}-${randomUUID()}`;
      session.updatedAt = new Date().toISOString();
      this.sessions[chatId] = session;
      this.persist();
    }

    return session.gatewaySessionId;
  }

  appendExchange(
    chatId: string,
    userText: string,
    assistantText: string,
    metadata?: SessionMetadata
  ): void {
    const session = this.sessions[chatId] ?? {
      messages: [],
      updatedAt: new Date(0).toISOString()
    };
    const newMessages: ConversationTurn[] = [
      {
        role: "user",
        content: userText,
        createdAt: new Date().toISOString()
      },
      {
        role: "assistant",
        content: assistantText,
        createdAt: new Date().toISOString()
      }
    ];

    session.messages = [...session.messages, ...newMessages].slice(-this.maxTurns * 2);
    session.updatedAt = new Date().toISOString();
    session.metadata = {
      ...session.metadata,
      ...metadata
    };

    this.sessions[chatId] = session;
    this.persist();
  }

  private load(): SessionMap {
    if (!existsSync(this.filePath)) {
      return {};
    }

    const rawValue = readFileSync(this.filePath, "utf8").trim();

    if (!rawValue) {
      return {};
    }

    return JSON.parse(rawValue) as SessionMap;
  }

  private persist(): void {
    const tempFilePath = `${this.filePath}.tmp`;
    const payload = `${JSON.stringify(this.sessions, null, 2)}\n`;

    writeFileSync(tempFilePath, payload, "utf8");
    renameSync(tempFilePath, this.filePath);
  }
}
