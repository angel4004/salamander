import type { ChatUxMode } from "./sessionStore.js";

export function formatModeReply(mode: ChatUxMode): string {
  if (mode === "qa") {
    return [
      "Включен audit-режим.",
      "Буду явно показывать scope, evidence, ограничения и confidence."
    ].join("\n");
  }

  return [
    "Включен compact-режим.",
    "Буду давать короткий вывод, ключевое evidence и следующий шаг."
  ].join("\n");
}
