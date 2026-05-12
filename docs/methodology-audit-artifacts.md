# Salamander Methodology Audit Artifacts

This document defines the offline handoff artifact emitted by Salamander for the root pre-merge quality loop.

## Contract

The JSON report is versioned by:

```json
{
  "schemaVersion": "salamander-methodology-audit-report-v0"
}
```

The top-level fields are root-compatible:

- `status`: `provided`, `tool_error`, `incomplete`, `skipped_with_waiver`, `not_required` or `missing_required`.
- `reason`: short machine-readable explanation for the status.
- `artifactPath`: local path to the JSON artifact.
- `verdict`: `pass`, `hard_fail`, `warning`, `needs_review` or `unknown`.
- `blockingFindings`: count of findings that should block a merge until reviewed or fixed.

The full Salamander payload includes:

- `run`
- `source_snapshot`
- `checked_files`
- `findings`
- `non_findings`
- `tool_status`
- `limitations`
- `recommended_human_review`

The static schema reference lives at [`../schemas/methodology-audit-report-v0.schema.json`](../schemas/methodology-audit-report-v0.schema.json). Runtime validation is implemented in [`../src/auditReport.ts`](../src/auditReport.ts) without adding a validator dependency.

## Taxonomy

Methodology findings may use only:

- `lost`
- `distorted`
- `underpacked`
- `unused`
- `invented_strictness`
- `local_adaptation_candidate`
- `uncertain`

`acceptable_compression` is explicitly a `non_findings` taxonomy. It must not appear in `findings`; if prepared model output emits it as a finding, Salamander writes an `incomplete` report with zero methodology findings.

Prepared model output may use legacy priority labels `П1`, `П2`, `П3` or machine labels `P1`, `P2`, `P3`. The offline runner normalizes them into optional `priority` values and required machine `severity` values:

- `П1` / `P1` -> `hard_fail`, blocking by default.
- `П2` / `P2` -> `warning`, non-blocking by default.
- `П3` / `P3` -> `warning`, non-blocking by default.

`local_adaptation_candidate` and `uncertain` normalize to `needs_review` unless the prepared output explicitly provides a stricter severity. This keeps human-review methodology questions from being silently downgraded to ordinary warnings.

## Offline Runner

The pre-merge runner is separate from Telegram runtime. It reads prepared model output and a pinned source snapshot, then writes local JSON and Markdown artifacts:

```bash
node --import tsx src/offlineAuditRunner.ts \
  --model-output path/to/prepared-model-output.json \
  --source-snapshot path/to/source-snapshot.json \
  --out-dir reports/premerge \
  --run-id premerge-local-001
```

The runner does not auto-update CPO source, does not call live providers, and must not import:

- `src/index.ts`
- `src/config.ts`
- `src/openai.ts`
- `src/openclawGateway.ts`

Source snapshot capture is intentionally an upstream/manual step for v0. The runner consumes the pinned snapshot as evidence that the audit was tied to a known candidate.

## Root Handoff

Root quality-gate tooling should consume the emitted JSON path via its `-MethodologyReportPath` argument:

```powershell
.\path\to\root-quality-gate.ps1 -MethodologyReportPath C:\path\to\reports\premerge\methodology-audit-report.json
```

Expected root handling:

- `status=provided`: use `verdict` and `blockingFindings` as Salamander's methodology signal.
- `status=tool_error`: do not treat output as methodology evidence; route to human review because the model/tool output was unreadable or invalid JSON.
- `status=incomplete`: do not treat output as methodology evidence; route to human review because schema validation or pinned source metadata was insufficient.
- `status=missing_required`: block or request the missing artifact according to the root release policy.
- `status=skipped_with_waiver` or `not_required`: preserve the waiver/reason in the root report.

`tool_error` and `incomplete` intentionally emit zero findings to avoid converting tool failures into false methodology defects.

## Golden Fixtures

Sanitized fixtures live in [`../src/testFixtures/golden-audit/`](../src/testFixtures/golden-audit/). They cover:

- all finding taxonomies;
- `acceptable_compression` as a non-finding;
- invalid `acceptable_compression` as a finding;
- missing source snapshot metadata;
- invalid prepared model output JSON.

These fixtures are source-level test inputs. They are not generated `dist` artifacts.
