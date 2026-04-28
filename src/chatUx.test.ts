import test from "node:test";
import assert from "node:assert/strict";
import { formatModeReply } from "./chatUx.js";

test("formatModeReply returns concise human mode text", () => {
  const text = formatModeReply("human");
  assert.match(text, /compact-режим/i);
  assert.match(text, /короткий вывод/i);
});

test("formatModeReply returns concise qa mode text", () => {
  const text = formatModeReply("qa");
  assert.match(text, /audit-режим/);
  assert.match(text, /evidence/i);
});
