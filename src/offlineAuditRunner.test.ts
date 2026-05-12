import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  isOfflineAuditRunnerEntrypoint,
  runOfflineAudit,
  type OfflineAuditRunnerOptions
} from "./offlineAuditRunner.js";
import type { MethodologyAuditReport } from "./auditReport.js";

const fixturesDir = join(process.cwd(), "src", "testFixtures", "golden-audit");

test("runOfflineAudit writes local JSON and Markdown artifacts from pinned inputs", async () => {
  const outputDir = mkdtempSync(join(tmpdir(), "salamander-audit-"));
  const options: OfflineAuditRunnerOptions = {
    modelOutputPath: join(fixturesDir, "valid-taxonomy-output.json"),
    sourceSnapshotPath: join(fixturesDir, "source-snapshot.json"),
    outputDir,
    runId: "offline-golden-run"
  };

  const result = await runOfflineAudit(options);

  assert.equal(result.report.status, "provided");
  assert.equal(result.report.schemaVersion, "salamander-methodology-audit-report-v0");
  assert.equal(result.report.artifactPath, result.jsonPath);
  assert.match(result.markdownPath, /methodology-audit-report\.md$/);

  const reportFromDisk = JSON.parse(
    readFileSync(result.jsonPath, "utf8")
  ) as MethodologyAuditReport;
  const markdown = readFileSync(result.markdownPath, "utf8");

  assert.equal(reportFromDisk.run.mode, "offline_pre_merge");
  assert.equal(reportFromDisk.source_snapshot.kind, "pinned_fixture");
  assert.equal(reportFromDisk.tool_status.status, "ok");
  assert.match(markdown, /# Salamander Methodology Audit Report/);
  assert.match(markdown, /hard_fail/);
});

test("runOfflineAudit maps missing source snapshot to incomplete without methodology findings", async () => {
  const outputDir = mkdtempSync(join(tmpdir(), "salamander-audit-missing-source-"));
  const result = await runOfflineAudit({
    modelOutputPath: join(fixturesDir, "valid-taxonomy-output.json"),
    sourceSnapshotPath: join(fixturesDir, "missing-source-snapshot.json"),
    outputDir,
    runId: "missing-source-run"
  });

  assert.equal(result.report.status, "incomplete");
  assert.equal(result.report.verdict, "needs_review");
  assert.equal(result.report.blockingFindings, 0);
  assert.deepEqual(result.report.findings, []);
  assert.match(result.report.reason, /source snapshot/i);
});

test("runOfflineAudit maps invalid model output to tool_error without methodology findings", async () => {
  const outputDir = mkdtempSync(join(tmpdir(), "salamander-audit-invalid-output-"));
  const result = await runOfflineAudit({
    modelOutputPath: join(fixturesDir, "invalid-json-output.json"),
    sourceSnapshotPath: join(fixturesDir, "source-snapshot.json"),
    outputDir,
    runId: "invalid-output-run"
  });

  assert.equal(result.report.status, "tool_error");
  assert.equal(result.report.verdict, "needs_review");
  assert.equal(result.report.blockingFindings, 0);
  assert.deepEqual(result.report.findings, []);
});

test("offline runner stays separate from Telegram runtime and live provider modules", () => {
  const source = readFileSync(join(process.cwd(), "src", "offlineAuditRunner.ts"), "utf8");

  assert.doesNotMatch(source, /from\s+["']\.\/index\.js["']/);
  assert.doesNotMatch(source, /from\s+["']\.\/config\.js["']/);
  assert.doesNotMatch(source, /from\s+["']\.\/openai\.js["']/);
  assert.doesNotMatch(source, /from\s+["']\.\/openclawGateway\.js["']/);
});

test("offline runner entrypoint detection supports source and built files", () => {
  assert.equal(
    isOfflineAuditRunnerEntrypoint("C:\\workspace\\src\\offlineAuditRunner.ts"),
    true
  );
  assert.equal(
    isOfflineAuditRunnerEntrypoint("/workspace/dist/offlineAuditRunner.js"),
    true
  );
  assert.equal(
    isOfflineAuditRunnerEntrypoint("/workspace/dist/offlineAuditRunner.test.js"),
    false
  );
});
