# AGENTS.md

Обращайся к пользователю: Илья.

## CPO Quality Ecosystem

Этот проект является частью workspace:

`C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem`

Точные sibling-проекты:

- `../cpo` — source under test; рабочий markdown-пакет CPO Copilot.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\cpo`
  - Git remote: `https://github.com/angel4004/cpo.git`
- `Salamander` — текущий methodology audit / observability layer.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\Salamander`
  - Git remote: `https://github.com/angel4004/Salamander.git`
- `../cpo-protocol-lab` — protocol harness.
  - Local path: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\cpo-protocol-lab`
  - Git remote: not configured yet; currently local-only.

Граница ответственности:

- Здесь проверяй methodology mapping: PAF reference layer → CPO Copilot working package.
- В `../cpo` меняется сам рабочий markdown-пакет CPO Copilot.
- В `../cpo-protocol-lab` проверяется observable protocol behavior через scenarios, fixtures, transcript, replay и deterministic evaluator.
- Общий pre-merge quality report и normalization относятся к root ecosystem / будущему quality-gate layer.
- Не импортируй код соседних проектов и не смешивай env/reports/deploy без явного запроса Ильи.

## Назначение этой рабочей папки

Эта папка используется для разработки `SalamanderBot` — Telegram-runtime для
методологического аудита CPO Copilot по PAF.

- локальная папка в этом workspace: `C:\Users\ilya.suvorov\Projects\Work\cpo-quality-ecosystem\Salamander`;
- Git repository URL: `https://github.com/angel4004/Salamander.git`;
- `SalamanderBot` — имя runtime/бота, `Salamander` — имя локального проекта/repository;
- OpenClaw здесь остается названием CLI/backend, через который runtime вызывает агента;
- не удаляй и не перетирай существующие локальные файлы без явного подтверждения Ильи.

Если папка еще не является Git-репозиторием, не делай `git clone` поверх нее.
Сначала предложи безопасную стратегию: `git init`, подключение `origin`,
импорт/сверка файлов или отдельный checkout.

## Термины и роли

### SalamanderBot

SalamanderBot — разрабатываемый локальный проект/repository и Telegram-runtime,
который сравнивает PAF reference layer и CPO Copilot working package.

### cpo-protocol-lab

`../cpo-protocol-lab` — соседний проект вокруг CPO Copilot.

Это protocol harness: он проверяет наблюдаемое поведение CPO Copilot через
API-диалоги, сценарии, фикстуры, deterministic contracts, transcript, replay и
reports.

Граница ответственности:

- если задача про методологический аудит PAF vs CPO Copilot working package —
  работай в `Salamander`;
- если задача про pass/fail конкретного onboarding-протокола, scenario,
  fixture, transcript, replay или deterministic evaluator — смотри
  `../cpo-protocol-lab`;
- не смешивай runtime, deploy, env, reports и файлы этих проектов без явного
  запроса Ильи.

Подробная карта: `docs/ecosystem.md`.

### OpenClaw CLI/backend

OpenClaw — CLI/backend, через который SalamanderBot вызывает агента:

- local project files: текущая папка;
- production server: `95.140.154.13`;
- production user: `root`;
- current production path: `/opt/openclaw-paf-auditor`;
- current production env: `/opt/openclaw-paf-auditor/.env`;
- current systemd user unit: `openclaw-paf-auditor.service`;
- canonical runbook: `deploy/RUNBOOK.md`.

Production path и service name пока исторические. Не переименовывай production
без отдельного подтверждения Ильи.

Runtime вызывает OpenClaw через CLI:

```bash
openclaw agent --agent <OPENCLAW_AGENT_ID> --session-id <session> --message <message> --json --timeout <seconds> --thinking <level>
```

Ключевые env-переменные:

- `MODEL_BACKEND=openclaw_gateway`;
- `OPENCLAW_AGENT_ID`;
- `OPENCLAW_CLI_PATH`;
- `OPENCLAW_THINKING`;
- `OPENCLAW_TIMEOUT_SECONDS`;
- `CPO_REPOSITORY_PATH`;
- `CPO_GITHUB_URL`;
- `CPO_BRANCH`;
- `CPO_AUTO_UPDATE`.

### HermioneResearchBot

HermioneResearchBot — отдельный будущий проект для глубоких web research-задач.
Не смешивай файлы HermioneResearchBot с SalamanderBot без явного запроса Ильи.

HermioneResearchBot будет размещаться на том же сервере/инфраструктурном
контуре, что и SalamanderBot, но это отдельный проект. У HermioneResearchBot и
SalamanderBot должны оставаться раздельными:

- Git repositories;
- локальные repositories/checkouts на сервере;
- рабочие папки в Codex;
- env-файлы;
- service/process names;
- команды запуска, deploy и smoke tests.

Перед deploy HermioneResearchBot всегда проверяй, что target path, Git remote,
service name и env относятся именно к HermioneResearchBot, а не к SalamanderBot.

## Критичные правила деплоя

1. Не деплой HermioneResearchBot поверх `/opt/openclaw-paf-auditor`, если Илья явно не просит изменить production runtime SalamanderBot.
2. Не деплой в "Salamander" как в инфраструктурный target без конкретных production-параметров.
3. Даже если HermioneResearchBot и SalamanderBot находятся на одном сервере, деплой должен идти в разные project paths/services/env.
4. Перед любым remote write-действием, `ssh` deploy, `systemctl restart`, `git push`, commit или PR требуется явное подтверждение Ильи.
5. Если задача относится к SalamanderBot runtime, сначала сверяйся с `deploy/RUNBOOK.md`.
6. Если задача относится к HermioneResearchBot deploy, а точные production параметры не заданы, остановись и запроси у Ильи:
   - сервер;
   - пользователь;
   - production path;
   - env path;
   - service name;
   - способ доставки кода;
   - smoke test.

## Проверки

Для локального SalamanderBot runtime доступны:

```bash
npm run check
npm run build
npm test
```

Запускай релевантные проверки после изменений. Если проверка не запускалась,
явно укажи причину и остаточный риск.

## Общие рабочие правила

- Отвечай Илье на русском.
- Делай минимально достаточный diff.
- Не трогай unrelated files.
- Учитывай legacy и DevEx-принципы из `DEVEX_PRINCIPLES.md`.
- Документацию держи человеко- и машино-читаемой: краткий верхний уровень плюс ссылки на подробные runbook/docs.
- Не выдумывай deployment target, env, secrets или production topology.
