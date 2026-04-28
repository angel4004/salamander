import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError } from "grammy";
import { isTelegramEntityParseError } from "./telegramFormat.js";

test("isTelegramEntityParseError detects Telegram HTML parse failures", () => {
  const error = new GrammyError(
    "Call to 'sendMessage' failed!",
    {
      ok: false,
      error_code: 400,
      description: "Bad Request: can't parse entities: Unsupported start tag"
    },
    "sendMessage",
    {}
  );

  assert.equal(isTelegramEntityParseError(error), true);
});

test("isTelegramEntityParseError ignores unrelated Telegram errors", () => {
  const error = new GrammyError(
    "Call to 'sendMessage' failed!",
    {
      ok: false,
      error_code: 403,
      description: "Forbidden: bot was blocked by the user"
    },
    "sendMessage",
    {}
  );

  assert.equal(isTelegramEntityParseError(error), false);
});
