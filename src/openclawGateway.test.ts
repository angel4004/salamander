import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenClawAgentArgs,
  parseOpenClawAgentResponse,
  toOpenClawThinking
} from "./openclawGateway.js";

test("buildOpenClawAgentArgs maps reasoning effort and preserves explicit session id", () => {
  const args = buildOpenClawAgentArgs({
    agentId: "openclaw-paf-auditor",
    cliPath: "openclaw",
    message: "ping",
    sessionId: "session-123",
    thinking: "none",
    timeoutSeconds: 120
  });

  assert.deepEqual(args, [
    "agent",
    "--agent",
    "openclaw-paf-auditor",
    "--session-id",
    "session-123",
    "--message",
    "ping",
    "--json",
    "--timeout",
    "120",
    "--thinking",
    "off"
  ]);
  assert.equal(toOpenClawThinking("high"), "high");
});

test("parseOpenClawAgentResponse accepts successful CLI json payloads", () => {
  const parsed = parseOpenClawAgentResponse(
    JSON.stringify({
      status: "ok",
      summary: "completed",
      result: {
        payloads: [
          {
            text: "pong"
          }
        ],
        meta: {
          agentMeta: {
            sessionId: "session-123",
            provider: "openai-codex",
            model: "gpt-5.4",
            usage: {
              input: 10,
              output: 20,
              cacheRead: 30,
              total: 60
            }
          }
        }
      }
    })
  );

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.result?.payloads?.[0]?.text, "pong");
});
