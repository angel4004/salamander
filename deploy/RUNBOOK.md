# SalamanderBot Production Runbook

Канонический production context:

- сервер: `95.140.154.13` (`fra-1-vm-o6sg`)
- пользователь: `root`
- production checkout: `/opt/openclaw-paf-auditor`
- env: `/opt/openclaw-paf-auditor/.env`
- systemd unit: `openclaw-paf-auditor.service`

## Preflight

Перед deploy проверить из текущей сессии:

1. Есть доступ по `ssh root@95.140.154.13`.
2. В `/opt/openclaw-paf-auditor/.env` задан рабочий `TELEGRAM_BOT_TOKEN`.
3. В `/opt/openclaw-paf-auditor/.env` задан рабочий backend:
   - рекомендуется `MODEL_BACKEND=openclaw_gateway` и валиден `OPENCLAW_AGENT_ID`;
   - `MODEL_BACKEND=openai_api` допустим только для ручных проверок по вставленным source excerpts.
4. В `/opt/openclaw-paf-auditor/.env` задан `CPO_REPOSITORY_PATH`, доступный runtime.
5. В `/opt/openclaw-paf-auditor/.env` задано `CPO_AUTO_UPDATE=true`.
6. По `CPO_REPOSITORY_PATH` доступны файлы `runtime/core` и `runtime/project_setup`.
7. `config/system-prompt.md` на месте.

Если preflight не пройден, deploy не делать.

## Deploy With Git

Использовать только если production checkout является Git-репозиторием с настроенным `origin`.

```bash
ssh root@95.140.154.13
cd /opt/openclaw-paf-auditor
git fetch origin main
git reset --hard origin/main
npm install
npm run build
systemctl --user restart openclaw-paf-auditor.service
systemctl --user status openclaw-paf-auditor.service --no-pager
journalctl --user -u openclaw-paf-auditor.service -n 50 --no-pager
```

## Deploy Without Git

Если Git-репозиторий SalamanderBot еще не заведен, можно синхронизировать каталог проекта на сервер любым безопасным способом.

Не копировать:

- `node_modules/`;
- `dist/`;
- `.env`;
- `data/sessions.json`;
- локальные editor/cache файлы.

После синхронизации выполнить на сервере:

```bash
ssh root@95.140.154.13
cd /opt/openclaw-paf-auditor
npm install
npm run build
systemctl --user restart openclaw-paf-auditor.service
systemctl --user status openclaw-paf-auditor.service --no-pager
journalctl --user -u openclaw-paf-auditor.service -n 50 --no-pager
```

## Polling Ownership

- Один публичный бот = один token = один polling runtime.

## Smoke Test

После restart отправить боту:

```text
/start
```

Затем:

```text
сделай короткий baseline-аудит CPO working package
```

Ожидаемый результат: OpenClaw явно называет проверенный scope, source-файлы или проблему доступа к ним, затем возвращает findings/non-findings или один следующий вопрос про source.
