import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type ModelBackend = "openai_api" | "openclaw_gateway";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value || undefined;
}

function getPositiveInt(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsed;
}

function getBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name]?.trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(rawValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(rawValue)) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean.`);
}

function getModelBackend(
  name = "MODEL_BACKEND",
  fallback: ModelBackend = "openai_api"
): ModelBackend {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const supportedValues: ModelBackend[] = ["openai_api", "openclaw_gateway"];

  if (!supportedValues.includes(rawValue as ModelBackend)) {
    throw new Error(`${name} must be one of: ${supportedValues.join(", ")}.`);
  }

  return rawValue as ModelBackend;
}

function getAllowedUserIds(): Set<number> {
  const rawValue = process.env.ALLOWED_TELEGRAM_USER_IDS?.trim();

  if (!rawValue) {
    return new Set<number>();
  }

  const ids = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));

  if (ids.some((value) => !Number.isInteger(value))) {
    throw new Error("ALLOWED_TELEGRAM_USER_IDS must contain only numeric Telegram user IDs.");
  }

  return new Set(ids);
}

function getReasoningEffort(name = "OPENAI_REASONING_EFFORT"): ReasoningEffort | undefined {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return undefined;
  }

  const supportedValues: ReasoningEffort[] = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh"
  ];

  if (!supportedValues.includes(rawValue as ReasoningEffort)) {
    throw new Error(`${name} must be one of: ${supportedValues.join(", ")}.`);
  }

  return rawValue as ReasoningEffort;
}

function getSystemPrompt(promptPath: string): string {
  if (!existsSync(promptPath)) {
    throw new Error(`System prompt file not found: ${promptPath}`);
  }

  return readFileSync(promptPath, "utf8").trim();
}

const rootDir = process.cwd();
const systemPromptPath = resolve(
  rootDir,
  process.env.SYSTEM_PROMPT_PATH?.trim() ?? "config/system-prompt.md"
);
const modelBackend = getModelBackend();
const openclawAgentId =
  modelBackend === "openclaw_gateway"
    ? getRequiredEnv("OPENCLAW_AGENT_ID")
    : process.env.OPENCLAW_AGENT_ID?.trim() || "";

export const appConfig = {
  allowedTelegramUserIds: getAllowedUserIds(),
  modelBackend,
  openaiApiKey:
    modelBackend === "openai_api"
      ? getRequiredEnv("OPENAI_API_KEY")
      : process.env.OPENAI_API_KEY?.trim() || undefined,
  openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-5-mini",
  openaiReasoningEffort: getReasoningEffort(),
  openclawAgentId,
  openclawCliPath: process.env.OPENCLAW_CLI_PATH?.trim() || "openclaw",
  openclawThinking: getReasoningEffort("OPENCLAW_THINKING"),
  openclawTimeoutSeconds: getPositiveInt("OPENCLAW_TIMEOUT_SECONDS", 600),
  cpoRepositoryPath: getOptionalEnv("CPO_REPOSITORY_PATH"),
  cpoGithubUrl: getOptionalEnv("CPO_GITHUB_URL") ?? "https://github.com/angel4004/cpo",
  cpoBranch: getOptionalEnv("CPO_BRANCH") ?? "main",
  cpoAutoUpdate: getBoolean("CPO_AUTO_UPDATE", true),
  sessionFilePath: resolve(
    rootDir,
    process.env.SESSION_FILE_PATH?.trim() ?? "data/sessions.json"
  ),
  sessionTurns: getPositiveInt("SESSION_TURNS", 12),
  systemPrompt: getSystemPrompt(systemPromptPath),
  systemPromptPath,
  telegramBotToken: getRequiredEnv("TELEGRAM_BOT_TOKEN")
} as const;
