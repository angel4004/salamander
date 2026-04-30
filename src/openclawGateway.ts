import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { ReasoningEffort } from "./config.js";

const execFileAsync = promisify(execFile);

type OpenClawThinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface OpenClawExecFileInvocation {
  command: string;
  args: string[];
}

interface OpenClawAgentPayload {
  text?: string | null;
}

interface OpenClawAgentMeta {
  sessionId?: string;
  provider?: string;
  model?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    total?: number;
  };
}

interface OpenClawAgentResponse {
  status?: string;
  summary?: string;
  result?: {
    payloads?: OpenClawAgentPayload[];
    meta?: {
      agentMeta?: OpenClawAgentMeta;
    };
  };
}

export interface OpenClawAgentRunOptions {
  agentId: string;
  cliPath: string;
  message: string;
  sessionId?: string;
  thinking?: ReasoningEffort;
  timeoutSeconds: number;
}

export interface OpenClawAgentRunResult {
  text: string;
  sessionId?: string;
  provider?: string;
  model?: string;
  usage: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    toolCalls: number;
    modelCalls: number;
  };
  raw: OpenClawAgentResponse;
}

export async function runOpenClawAgent(
  options: OpenClawAgentRunOptions
): Promise<OpenClawAgentRunResult> {
  const invocation = buildOpenClawExecFileInvocation(
    options.cliPath,
    buildOpenClawAgentArgs(options)
  );
  const response = parseOpenClawAgentResponse(
    (
      await execFileAsync(
        invocation.command,
        invocation.args,
        {
          maxBuffer: 20 * 1024 * 1024,
          timeout: options.timeoutSeconds * 1000
        }
      )
    ).stdout
  );
  const agentMeta = response.result?.meta?.agentMeta;
  const usage = agentMeta?.usage;

  return {
    text: extractOpenClawText(response),
    sessionId: agentMeta?.sessionId,
    provider: agentMeta?.provider,
    model: agentMeta?.model,
    usage: {
      totalTokens: usage?.total ?? 0,
      inputTokens: usage?.input ?? 0,
      outputTokens: usage?.output ?? 0,
      cacheReadTokens: usage?.cacheRead ?? 0,
      toolCalls: 0,
      modelCalls: 1
    },
    raw: response
  };
}

export function buildOpenClawAgentArgs(options: OpenClawAgentRunOptions): string[] {
  const args = [
    "agent",
    "--agent",
    options.agentId,
    "--session-id",
    options.sessionId ?? createEphemeralOpenClawSessionId("openclaw-audit"),
    "--message",
    options.message,
    "--json",
    "--timeout",
    String(options.timeoutSeconds)
  ];
  const thinking = toOpenClawThinking(options.thinking);

  if (thinking) {
    args.push("--thinking", thinking);
  }

  return args;
}

export function buildOpenClawExecFileInvocation(
  cliPath: string,
  args: string[],
  nodePath = process.execPath
): OpenClawExecFileInvocation {
  if (/\.(?:cjs|js|mjs)$/iu.test(cliPath)) {
    return {
      command: nodePath,
      args: [cliPath, ...args]
    };
  }

  return {
    command: cliPath,
    args
  };
}

export function parseOpenClawAgentResponse(rawText: string): OpenClawAgentResponse {
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error("OpenClaw agent returned an empty stdout payload.");
  }

  const parsed = JSON.parse(trimmed) as OpenClawAgentResponse;

  if (parsed.status !== "ok") {
    throw new Error(
      `OpenClaw agent call failed: ${parsed.summary ?? parsed.status ?? "unknown_error"}.`
    );
  }

  return parsed;
}

export function extractOpenClawText(payload: OpenClawAgentResponse): string {
  const text = (payload.result?.payloads ?? [])
    .map((item) => item.text?.trim())
    .filter((item): item is string => Boolean(item))
    .join("\n\n")
    .trim();

  if (!text) {
    throw new Error("OpenClaw agent returned an empty text payload.");
  }

  return text;
}

export function toOpenClawThinking(
  reasoningEffort: ReasoningEffort | undefined
): OpenClawThinking | undefined {
  if (!reasoningEffort) {
    return undefined;
  }

  if (reasoningEffort === "none") {
    return "off";
  }

  return reasoningEffort;
}

export function createEphemeralOpenClawSessionId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
