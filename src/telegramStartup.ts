import { setTimeout as delay } from "node:timers/promises";
import { GrammyError, HttpError } from "grammy";

const TRANSIENT_NETWORK_CODES = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT"
]);

const TRANSIENT_NETWORK_PATTERNS = [
  /\baborted\b/i,
  /\btimeout\b/i,
  /\betimedout\b/i,
  /\bfetch failed\b/i,
  /\bnetwork request\b/i,
  /\bsocket hang up\b/i,
  /\btemporary failure\b/i
];

type StartupLogger = Pick<Console, "warn" | "error">;

export type TelegramStartupErrorKind =
  | "telegram_network_transient"
  | "telegram_api_retryable"
  | "telegram_api_fatal"
  | "unexpected";

export interface TelegramStartupErrorClassification {
  kind: TelegramStartupErrorKind;
  retryable: boolean;
  summary: string;
}

interface RunNonCriticalTelegramStartupSideEffectOptions {
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  logger?: StartupLogger;
}

export async function runNonCriticalTelegramStartupSideEffect(
  name: string,
  action: () => Promise<unknown>,
  options: RunNonCriticalTelegramStartupSideEffectOptions = {}
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 1_000);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 10_000);
  const logger = options.logger ?? console;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runWithTimeout(name, timeoutMs, action);

      if (attempt > 1) {
        logger.warn(
          `[startup] Telegram side effect '${name}' recovered on attempt ${attempt}/${attempts}.`
        );
      }

      return;
    } catch (error) {
      const classification = classifyTelegramStartupError(error);

      if (!classification.retryable) {
        logger.error(
          `[startup] Telegram side effect '${name}' failed; classification=${classification.kind}; ${classification.summary}; continuing without this non-critical side effect.`
        );
        return;
      }

      if (attempt >= attempts) {
        logger.warn(
          `[startup] Telegram side effect '${name}' failed; classification=${classification.kind}; ${classification.summary}; continuing without this non-critical side effect.`
        );
        return;
      }

      logger.warn(
        `[startup] Telegram side effect '${name}' failed on attempt ${attempt}/${attempts}; classification=${classification.kind}; ${classification.summary}; retrying in ${retryDelayMs}ms.`
      );

      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    }
  }
}

export function classifyTelegramStartupError(
  error: unknown
): TelegramStartupErrorClassification {
  if (error instanceof GrammyError) {
    const retryable = error.error_code === 429 || error.error_code >= 500;

    return {
      kind: retryable ? "telegram_api_retryable" : "telegram_api_fatal",
      retryable,
      summary: `telegram_method=${error.method}; error_code=${error.error_code}; description=${error.description}`
    };
  }

  const details = collectErrorDetails(error);
  const matchedCode = details.find((detail) => detail.code && TRANSIENT_NETWORK_CODES.has(detail.code))
    ?.code;
  const matchedMessage = details.find((detail) =>
    TRANSIENT_NETWORK_PATTERNS.some((pattern) => pattern.test(detail.message))
  )?.message;

  if (error instanceof HttpError || matchedCode || matchedMessage) {
    const fragments = [
      error instanceof HttpError ? "http_error=true" : undefined,
      matchedCode ? `code=${matchedCode}` : undefined,
      matchedMessage ? `message=${matchedMessage}` : undefined,
      !matchedMessage && error instanceof Error && error.message ? `message=${error.message}` : undefined
    ].filter(Boolean);

    return {
      kind: "telegram_network_transient",
      retryable: true,
      summary: fragments.join("; ")
    };
  }

  if (error instanceof Error) {
    return {
      kind: "unexpected",
      retryable: false,
      summary: `${error.name}: ${error.message}`
    };
  }

  return {
    kind: "unexpected",
    retryable: false,
    summary: `non_error_throw=${String(error)}`
  };
}

export function formatTelegramStartupFailure(error: unknown): string {
  const classification = classifyTelegramStartupError(error);
  return `classification=${classification.kind}; retryable=${classification.retryable}; ${classification.summary}`;
}

function collectErrorDetails(error: unknown): Array<{ code?: string; message: string }> {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  const details: Array<{ code?: string; message: string }> = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);

    const code = getErrorCode(current);
    const message = getErrorMessage(current);

    if (message || code) {
      details.push({
        code,
        message: message ?? ""
      });
    }

    if (typeof current !== "object") {
      continue;
    }

    if ("cause" in current) {
      queue.push(current.cause);
    }

    if ("error" in current) {
      queue.push(current.error);
    }

    if ("errors" in current && Array.isArray(current.errors)) {
      queue.push(...current.errors);
    }
  }

  return details;
}

function getErrorCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return undefined;
  }

  return typeof value.code === "string" ? value.code : undefined;
}

function getErrorMessage(value: unknown): string | undefined {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value !== "object" || value === null || !("message" in value)) {
    return undefined;
  }

  return typeof value.message === "string" ? value.message : undefined;
}

async function runWithTimeout(
  name: string,
  timeoutMs: number,
  action: () => Promise<unknown>
): Promise<unknown> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            Object.assign(
              new Error(
                `Telegram startup side effect '${name}' timed out after ${timeoutMs}ms.`
              ),
              {
                code: "ETIMEDOUT"
              }
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
