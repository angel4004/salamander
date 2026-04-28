import { Bot, GrammyError, HttpError } from "grammy";
import { formatModeReply } from "./chatUx.js";
import { appConfig } from "./config.js";
import { generateAssistantReply } from "./openai.js";
import { SessionStore } from "./sessionStore.js";
import {
  formatTelegramStartupFailure,
  runNonCriticalTelegramStartupSideEffect
} from "./telegramStartup.js";
import { isTelegramEntityParseError, TELEGRAM_PARSE_MODE } from "./telegramFormat.js";
import { splitTelegramMessage } from "./text.js";

const sessionStore = new SessionStore(appConfig.sessionFilePath, appConfig.sessionTurns);
const bot = new Bot(appConfig.telegramBotToken);
const telegramCommands = [
  {
    command: "start",
    description: "Show SalamanderBot auditor status"
  },
  {
    command: "reset",
    description: "Clear local chat context"
  },
  {
    command: "mode",
    description: "Switch compact/audit detail mode"
  }
] as const;

function isAllowedUser(userId: number | undefined): boolean {
  if (appConfig.allowedTelegramUserIds.size === 0) {
    return true;
  }

  if (!userId) {
    return false;
  }

  return appConfig.allowedTelegramUserIds.has(userId);
}

async function replyInChunks(chatId: number | string, text: string): Promise<void> {
  const chunks = splitTelegramMessage(text);

  for (const chunk of chunks) {
    try {
      await bot.api.sendMessage(chatId, chunk, {
        parse_mode: TELEGRAM_PARSE_MODE
      });
    } catch (error) {
      if (!isTelegramEntityParseError(error)) {
        throw error;
      }

      console.warn("Telegram could not parse assistant HTML markup; falling back to plain text.");
      await bot.api.sendMessage(chatId, chunk);
    }
  }
}

bot.use(async (ctx, next) => {
  if (!isAllowedUser(ctx.from?.id)) {
    console.warn(`Blocked Telegram user: ${ctx.from?.id ?? "unknown"}`);
    return;
  }

  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "SalamanderBot запущен.",
      `Команда /reset очищает локальный контекст диалога${appConfig.modelBackend === "openclaw_gateway" ? " и сбрасывает OpenClaw session для этого чата" : ""}.`,
      "Команда /mode human|qa переключает compact- и audit-режим ответа.",
      "Для baseline-аудита напиши: сделай baseline-аудит CPO working package."
    ].join("\n")
  );
});

bot.command("reset", async (ctx) => {
  sessionStore.clear(String(ctx.chat.id));
  await ctx.reply("Локальный контекст очищен.");
});

bot.command("mode", async (ctx) => {
  const rawText = ctx.message?.text ?? "";
  const commandBody = rawText.replace(/^\/mode(?:@\w+)?/u, "").trim().toLowerCase();
  const normalizedMode = commandBody.replace(/[.,!?;:]+$/u, "");
  const chatId = String(ctx.chat.id);

  if (!normalizedMode) {
    await ctx.reply(formatModeReply(sessionStore.getUxMode(chatId)));
    return;
  }

  if (normalizedMode !== "human" && normalizedMode !== "qa") {
    await ctx.reply("Используйте /mode human или /mode qa.");
    return;
  }

  sessionStore.setUxMode(chatId, normalizedMode);
  await ctx.reply(formatModeReply(normalizedMode));
});

bot.on("message:text", async (ctx) => {
  const userText = ctx.message.text.trim();

  if (!userText || userText.startsWith("/")) {
    return;
  }

  const chatId = String(ctx.chat.id);
  const uxMode = sessionStore.getUxMode(chatId);
  const history = sessionStore.getHistory(chatId);
  const gatewaySessionId =
    appConfig.modelBackend === "openclaw_gateway"
      ? sessionStore.getOrCreateGatewaySessionId(chatId)
      : undefined;

  await ctx.replyWithChatAction("typing");

  try {
    const assistantReply = await generateAssistantReply({
      chatId,
      history,
      userInput: userText,
      gatewaySessionId,
      uxMode
    });

    sessionStore.appendExchange(chatId, userText, assistantReply, {
      firstName: ctx.from?.first_name,
      userId: ctx.from?.id,
      username: ctx.from?.username
    });

    await replyInChunks(ctx.chat.id, assistantReply);
  } catch (error) {
    console.error("Failed to process Telegram message.", error);
    await ctx.reply("Не смог получить ответ от модели. Проверь логи сервиса.");
  }
});

bot.catch((error) => {
  const context = error.ctx;

  if (error.error instanceof GrammyError) {
    console.error(`Telegram API error on update ${context.update.update_id}`, error.error);
    return;
  }

  if (error.error instanceof HttpError) {
    console.error(
      `Telegram network error on update ${context.update.update_id}`,
      error.error
    );
    return;
  }

  console.error(`Unknown bot error on update ${context.update.update_id}`, error.error);
});

async function main(): Promise<void> {
  console.log(
    appConfig.modelBackend === "openclaw_gateway"
      ? `Starting bot with OpenClaw agent ${appConfig.openclawAgentId}`
      : `Starting bot with model ${appConfig.openaiModel}`
  );
  console.log(`Model backend: ${appConfig.modelBackend}`);
  console.log(`System prompt: ${appConfig.systemPromptPath}`);
  console.log(`Session store: ${appConfig.sessionFilePath}`);
  console.log("Telegram polling bootstrap: grammY deleteWebhook retry path is authoritative.");

  await bot.start({
    drop_pending_updates: false,
    onStart: async () => {
      void runNonCriticalTelegramStartupSideEffect("setMyCommands", () =>
        bot.api.setMyCommands(telegramCommands)
      );
    }
  });
}

main().catch((error) => {
  console.error(`Bot failed to start. ${formatTelegramStartupFailure(error)}`);
  console.error(error);
  process.exitCode = 1;
});
