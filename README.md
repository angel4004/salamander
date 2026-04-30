# SalamanderBot PAF Auditor Telegram Runtime

Этот проект запускает SalamanderBot как Telegram-контур методологического аудита CPO Copilot.

SalamanderBot сравнивает:

- PAF reference layer: `runtime/core/canon_paf_knowledge_layer.md` и явно связанные с ним PAF-источники;
- CPO Copilot working package: method-файлы и launch/use/setup-файлы, которые переводят PAF в поведение copilot.

Цель аудита — находить методологические расхождения, которые могут снижать customer success для продактов TravelLine: хуже проверяются гипотезы, позже отсекаются слабые направления, задачи слабее связаны с клиентской ценностью или уходят в разработку без достаточного основания.

## Related CPO Copilot quality layers

`Salamander` — methodology audit / observability layer: он проверяет, как PAF reference layer переведен в CPO Copilot working package.

Соседний проект `cpo-protocol-lab` находится рядом в рабочей папке:

```text
../cpo-protocol-lab
```

`cpo-protocol-lab` решает другую задачу: это protocol harness для CPO Copilot. Он прогоняет API-диалоги между Copilot under test и AI-user simulator, затем проверяет transcript по сценариям, фикстурам и deterministic contracts.

Эти проекты дополняют друг друга, но не являются runtime-зависимостями друг друга. Подробнее: [docs/ecosystem.md](docs/ecosystem.md).

## Quick Start

1. Скопируй `.env.example` в `.env`.
2. Заполни `TELEGRAM_BOT_TOKEN`.
3. Выбери backend:
   - рекомендуется `MODEL_BACKEND=openclaw_gateway` и рабочий `OPENCLAW_AGENT_ID`;
   - `MODEL_BACKEND=openai_api` подходит только для ответов по явно присланным выдержкам, потому что не имеет доступа к локальным файлам.
4. Укажи источник CPO:
   - `CPO_REPOSITORY_PATH` — локальный checkout `angel4004/cpo`, доступный runtime;
   - `CPO_GITHUB_URL` — fallback-ссылка на репозиторий.
5. Установи зависимости: `npm install`
6. Запусти локально: `npm run dev`

Команды бота:
- `/start`
- `/reset`
- `/mode human|qa`

`human` включает compact-ответы. `qa` включает audit-режим с явным scope, evidence, limitations и confidence.

## Environment

Минимум:

```env
TELEGRAM_BOT_TOKEN=...
MODEL_BACKEND=openclaw_gateway
OPENCLAW_AGENT_ID=...
CPO_REPOSITORY_PATH=/path/to/cpo
CPO_GITHUB_URL=https://github.com/angel4004/cpo
CPO_BRANCH=main
CPO_AUTO_UPDATE=true
```

Если используешь OpenAI API:

```env
TELEGRAM_BOT_TOKEN=...
MODEL_BACKEND=openai_api
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

Опционально:

```env
ALLOWED_TELEGRAM_USER_IDS=123456789
SESSION_FILE_PATH=data/sessions.json
SESSION_TURNS=12
SYSTEM_PROMPT_PATH=config/system-prompt.md
OPENAI_REASONING_EFFORT=medium
OPENCLAW_CLI_PATH=openclaw
OPENCLAW_THINKING=medium
OPENCLAW_TIMEOUT_SECONDS=600
```

`CPO_AUTO_UPDATE=true` заставляет runtime перед каждым запросом обновлять локальный CPO checkout через `git fetch` и `git pull --ff-only`. Если fast-forward невозможен, OpenClaw сообщает, что audit может идти по stale source.

`OPENCLAW_CLI_PATH` по умолчанию использует `openclaw` из `PATH`. Для локального или vendored CLI можно указать явный путь, например `/usr/bin/openclaw` или `./tools/openclaw/openclaw.mjs`; `.js`, `.mjs` и `.cjs` файлы runtime запускает через текущий Node.js.

## Audit Scope

SalamanderBot должен отвечать на пять вопросов:

- что потеряно;
- что искажено;
- что недоупаковано;
- что не используется;
- где появилась изобретенная строгость.

Он не анализирует реальные ответы GPT Project, project memory, пользовательские документы, реальные диалоги, техническую реализацию CPO Copilot, storage, cron, pipeline, API, классы или OpenClaw-конфигурацию.

SalamanderBot не правит source-файлы CPO Copilot и не назначает финальный методологический статус. Он показывает signal, evidence, confidence, forbidden claims и рекомендацию по эскалации человеку.

## Production

Канонический production context задается серверной установкой:

- сервер: `95.140.154.13` (`fra-1-vm-o6sg`)
- пользователь: `root`
- рекомендуемый checkout: `/opt/openclaw-paf-auditor`
- env: `/opt/openclaw-paf-auditor/.env`
- systemd unit: `openclaw-paf-auditor.service`

Канонический runbook: [deploy/RUNBOOK.md](deploy/RUNBOOK.md)

Git для этого проекта удобен, но не обязателен. Если Git-репозиторий SalamanderBot не заведен, runtime можно доставлять на сервер синхронизацией каталога без `node_modules`, `dist`, `.env` и `data/sessions.json`.

Операционное правило:

- один публичный бот = один token = один polling runtime;
- нельзя запускать второй polling-процесс на том же token.

## Structure

- [src/index.ts](src/index.ts) — Telegram runtime
- [src/openai.ts](src/openai.ts) — вызов модели
- [src/openclawGateway.ts](src/openclawGateway.ts) — OpenClaw CLI transport
- [src/sessionStore.ts](src/sessionStore.ts) — локальная память диалога
- [src/config.ts](src/config.ts) — env и runtime config
- [config/system-prompt.md](config/system-prompt.md) — методологический контракт SalamanderBot
