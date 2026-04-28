import assert from "node:assert/strict";
import test from "node:test";
import { GrammyError, HttpError } from "grammy";
import {
  classifyTelegramStartupError,
  formatTelegramStartupFailure,
  runNonCriticalTelegramStartupSideEffect
} from "./telegramStartup.js";

function createTransientHttpError(): HttpError {
  const cause = Object.assign(new Error("connect ETIMEDOUT 149.154.167.220:443"), {
    code: "ETIMEDOUT"
  });

  return new HttpError("Network request for 'deleteWebhook' failed!", cause);
}

test("classifies ETIMEDOUT startup errors as transient network failures", () => {
  const classification = classifyTelegramStartupError(createTransientHttpError());

  assert.equal(classification.kind, "telegram_network_transient");
  assert.equal(classification.retryable, true);
  assert.match(classification.summary, /ETIMEDOUT/);
});

test("classifies telegram API conflicts as fatal startup errors", () => {
  const classification = classifyTelegramStartupError(
    new GrammyError(
      "Call to 'getUpdates' failed!",
      {
        ok: false,
        error_code: 409,
        description: "Conflict: terminated by other getUpdates request"
      },
      "getUpdates",
      {}
    )
  );

  assert.equal(classification.kind, "telegram_api_fatal");
  assert.equal(classification.retryable, false);
  assert.match(classification.summary, /error_code=409/);
});

test("classifies local startup bugs as unexpected failures", () => {
  const classification = classifyTelegramStartupError(new Error("boom"));

  assert.equal(classification.kind, "unexpected");
  assert.equal(classification.retryable, false);
  assert.match(classification.summary, /boom/);
});

test("non-critical startup side effects degrade after bounded transient retries", async () => {
  const warnings: string[] = [];
  let attempts = 0;

  await runNonCriticalTelegramStartupSideEffect(
    "setMyCommands",
    async () => {
      attempts += 1;
      throw createTransientHttpError();
    },
    {
      attempts: 2,
      retryDelayMs: 0,
      timeoutMs: 10,
      logger: {
        warn: (message: string) => warnings.push(message),
        error: () => undefined
      }
    }
  );

  assert.equal(attempts, 2);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0] ?? "", /retrying in 0ms/);
  assert.match(
    warnings[1] ?? "",
    /continuing without this non-critical side effect/
  );
});

test("fatal non-critical startup side effects are logged and swallowed", async () => {
  const errors: string[] = [];

  await runNonCriticalTelegramStartupSideEffect(
    "setMyCommands",
    async () => {
      throw new GrammyError(
        "Call to 'setMyCommands' failed!",
        {
          ok: false,
          error_code: 401,
          description: "Unauthorized"
        },
        "setMyCommands",
        {}
      );
    },
    {
      attempts: 2,
      retryDelayMs: 0,
      timeoutMs: 10,
      logger: {
        warn: () => undefined,
        error: (message: string) => errors.push(message)
      }
    }
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /telegram_api_fatal/);
  assert.match(errors[0] ?? "", /continuing without this non-critical side effect/);
});

test("startup failure formatter exposes classification for logs", () => {
  const transientMessage = formatTelegramStartupFailure(createTransientHttpError());
  assert.match(transientMessage, /classification=telegram_network_transient/);
  assert.match(transientMessage, /retryable=true/);

  const unexpectedMessage = formatTelegramStartupFailure(new Error("boom"));
  assert.match(unexpectedMessage, /classification=unexpected/);
  assert.match(unexpectedMessage, /retryable=false/);
});
