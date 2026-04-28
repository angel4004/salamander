import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionStore } from "./sessionStore.js";

test("SessionStore rotates gateway session id after reset", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "openclaw-audit-session-store-")), "sessions.json");
  const store = new SessionStore(filePath, 12);

  const firstSessionId = store.getOrCreateGatewaySessionId("chat-1");
  store.appendExchange("chat-1", "hi", "pong");
  assert.equal(store.getOrCreateGatewaySessionId("chat-1"), firstSessionId);

  store.clear("chat-1");

  const secondSessionId = store.getOrCreateGatewaySessionId("chat-1");
  assert.notEqual(secondSessionId, firstSessionId);
});

test("SessionStore stores chat ux mode per chat", () => {
  const filePath = join(mkdtempSync(join(tmpdir(), "openclaw-audit-session-store-")), "sessions.json");
  const store = new SessionStore(filePath, 12);

  assert.equal(store.getUxMode("chat-1"), "human");

  store.setUxMode("chat-1", "qa");

  const reloadedStore = new SessionStore(filePath, 12);
  assert.equal(reloadedStore.getUxMode("chat-1"), "qa");
});
