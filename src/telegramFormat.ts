import { GrammyError } from "grammy";

export const TELEGRAM_PARSE_MODE = "HTML" as const;

export function isTelegramEntityParseError(error: unknown): boolean {
  if (!(error instanceof GrammyError)) {
    return false;
  }

  return error.error_code === 400 && /parse entities|can't parse/i.test(error.description);
}
