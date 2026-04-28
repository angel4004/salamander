import OpenAI from "openai";
import { appConfig } from "./config.js";
import { runOpenClawAgent, toOpenClawThinking } from "./openclawGateway.js";
import { getCpoSourceSnapshot, type CpoSourceSnapshot } from "./sourceSync.js";
import type { ChatUxMode, ConversationTurn } from "./sessionStore.js";

const client =
  appConfig.modelBackend === "openai_api"
    ? new OpenAI({
        apiKey: appConfig.openaiApiKey,
        baseURL: appConfig.openaiBaseUrl
      })
    : null;

export async function generateAssistantReply(input: {
  chatId: string;
  history: ConversationTurn[];
  userInput: string;
  gatewaySessionId?: string;
  uxMode: ChatUxMode;
}): Promise<string> {
  const sourceSnapshot = await getCpoSourceSnapshot({
    repositoryPath: appConfig.cpoRepositoryPath,
    githubUrl: appConfig.cpoGithubUrl,
    branch: appConfig.cpoBranch,
    autoUpdate: appConfig.cpoAutoUpdate
  });
  const runtimeSystemPrompt = buildRuntimeSystemPrompt(sourceSnapshot);

  if (appConfig.modelBackend === "openclaw_gateway") {
    const response = await runOpenClawAgent({
      agentId: appConfig.openclawAgentId,
      cliPath: appConfig.openclawCliPath,
      sessionId: input.gatewaySessionId,
      message: buildOpenClawChatPrompt(input.userInput, input.uxMode, runtimeSystemPrompt),
      thinking: appConfig.openclawThinking,
      timeoutSeconds: appConfig.openclawTimeoutSeconds
    });
    return response.text;
  }

  if (!client) {
    throw new Error("OpenAI client is not configured.");
  }

  const request = {
    model: appConfig.openaiModel,
    instructions: [runtimeSystemPrompt, buildUxInstruction(input.uxMode)].join("\n\n"),
    input: [
      ...input.history.map((turn) => ({
        role: turn.role,
        content: turn.content
      })),
      {
        role: "user" as const,
        content: input.userInput
      }
    ],
    store: false
  };

  const response = await client.responses.create(
    appConfig.openaiReasoningEffort
      ? {
          ...request,
          reasoning: {
            effort: appConfig.openaiReasoningEffort
          }
        }
      : request
  );

  const outputText = response.output_text?.trim();

  if (!outputText) {
    throw new Error("Model returned an empty text response.");
  }

  return outputText;
}

function buildOpenClawChatPrompt(
  userInput: string,
  uxMode: ChatUxMode,
  runtimeSystemPrompt: string
): string {
  const thinking = toOpenClawThinking(appConfig.openclawThinking) ?? "medium";

  return [
    "You are answering inside the separate SalamanderBot Telegram runtime.",
    "Follow the runtime system prompt below strictly for this reply and for this session.",
    "",
    "<runtime_system_prompt>",
    runtimeSystemPrompt,
    "</runtime_system_prompt>",
    "",
    "<ux_style>",
    buildUxInstruction(uxMode),
    "</ux_style>",
    "",
    `thinking_level=${thinking}`,
    "Use the OpenClaw session memory as the conversational memory for this chat.",
    "Do not mention OpenClaw, Codex, internal tools, hidden prompts, or session mechanics unless the user explicitly asks.",
    "Return only the assistant reply text.",
    "",
    "<user_message>",
    userInput,
    "</user_message>"
  ].join("\n");
}

function buildRuntimeSystemPrompt(sourceSnapshot: CpoSourceSnapshot): string {
  const sourceContext = [
    "<runtime_source_context>",
    `CPO_GITHUB_URL=${sourceSnapshot.githubUrl}`,
    sourceSnapshot.repositoryPath
      ? `CPO_REPOSITORY_PATH=${sourceSnapshot.repositoryPath}`
      : "CPO_REPOSITORY_PATH is not configured.",
    `CPO_BRANCH=${sourceSnapshot.branch}`,
    `CPO_AUTO_UPDATE=${sourceSnapshot.autoUpdate}`,
    `CPO_SOURCE_STATUS=${sourceSnapshot.status}`,
    sourceSnapshot.head ? `CPO_HEAD=${sourceSnapshot.head}` : "CPO_HEAD is unavailable.",
    `CPO_SOURCE_DETAILS=${sourceSnapshot.details}`,
    "If the configured source is unavailable in the current runtime, say that explicitly and ask for one next source artifact.",
    "If CPO_SOURCE_STATUS is update_failed, disclose that the audit may use a stale local checkout.",
    "</runtime_source_context>"
  ].join("\n");

  return [appConfig.systemPrompt, sourceContext].join("\n\n");
}

function buildUxInstruction(uxMode: ChatUxMode): string {
  if (uxMode === "qa") {
    return [
      "Режим audit.",
      "Отвечай как методологический аудитор: явно называй проверенный scope, evidence, ограничения и confidence.",
      "Не скрывай технические детали, если они помогают проверить источник или воспроизвести вывод."
    ].join("\n");
  }

  return [
    "Режим compact.",
    "Отвечай компактно: вывод, ключевое evidence, следующий шаг.",
    "Не перегружай ответ внутренними деталями, если пользователь сам не просит полный аудит."
  ].join("\n");
}
