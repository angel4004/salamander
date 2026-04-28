const TELEGRAM_MESSAGE_LIMIT = 4000;

export function splitTelegramMessage(text: string): string[] {
  const trimmedText = text.trim();

  if (trimmedText.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [trimmedText];
  }

  const chunks: string[] = [];
  let remaining = trimmedText;

  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf("\n\n", TELEGRAM_MESSAGE_LIMIT);

    if (splitAt < TELEGRAM_MESSAGE_LIMIT / 2) {
      splitAt = remaining.lastIndexOf("\n", TELEGRAM_MESSAGE_LIMIT);
    }

    if (splitAt < TELEGRAM_MESSAGE_LIMIT / 2) {
      splitAt = remaining.lastIndexOf(" ", TELEGRAM_MESSAGE_LIMIT);
    }

    if (splitAt < TELEGRAM_MESSAGE_LIMIT / 2) {
      splitAt = TELEGRAM_MESSAGE_LIMIT;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
