import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildMethodologyAuditReport,
  parsePreparedAuditOutput,
  type PreparedAuditOutput,
  type SourceSnapshot
} from "./auditReport.js";

const fixturesDir = join(process.cwd(), "src", "testFixtures", "golden-audit");

function readJson<T>(fixtureName: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, fixtureName), "utf8")) as T;
}

test("buildMethodologyAuditReport emits root summary and full Salamander v0 contract", () => {
  const preparedOutput = readJson<PreparedAuditOutput>("valid-taxonomy-output.json");
  const sourceSnapshot = readJson<SourceSnapshot>("source-snapshot.json");

  const report = buildMethodologyAuditReport({
    preparedOutput,
    sourceSnapshot,
    artifactPath: "reports/methodology-audit-report.json",
    runId: "golden-run"
  });

  assert.equal(report.schemaVersion, "salamander-methodology-audit-report-v0");
  assert.equal(report.status, "provided");
  assert.equal(report.reason, "Prepared methodology audit output was normalized successfully.");
  assert.equal(report.artifactPath, "reports/methodology-audit-report.json");
  assert.equal(report.verdict, "hard_fail");
  assert.equal(report.blockingFindings, 1);
  assert.equal(report.run.id, "golden-run");
  assert.deepEqual(report.source_snapshot, sourceSnapshot);
  assert.equal(report.checked_files.length, 2);
  assert.deepEqual(
    report.findings.map((finding) => finding.taxonomy),
    [
      "lost",
      "distorted",
      "underpacked",
      "unused",
      "invented_strictness",
      "local_adaptation_candidate",
      "uncertain"
    ]
  );
  assert.deepEqual(
    report.non_findings.map((nonFinding) => nonFinding.taxonomy),
    ["acceptable_compression"]
  );
  assert.equal(report.tool_status.status, "ok");
  assert.deepEqual(report.limitations, ["Golden fixture uses sanitized excerpts only."]);
  assert.deepEqual(report.recommended_human_review, [
    "Review the blocking lost-methodology signal before merge."
  ]);
});

test("acceptable_compression is invalid as a methodology finding", () => {
  const sourceSnapshot = readJson<SourceSnapshot>("source-snapshot.json");
  const invalidOutput = readJson<PreparedAuditOutput>("invalid-acceptable-compression-finding.json");

  const report = buildMethodologyAuditReport({
    preparedOutput: invalidOutput,
    sourceSnapshot,
    artifactPath: "reports/methodology-audit-report.json",
    runId: "invalid-taxonomy-run"
  });

  assert.equal(report.status, "incomplete");
  assert.equal(report.verdict, "needs_review");
  assert.equal(report.blockingFindings, 0);
  assert.deepEqual(report.findings, []);
  assert.match(report.reason, /acceptable_compression/i);
  assert.equal(report.tool_status.status, "schema_mismatch");
  assert.deepEqual(report.recommended_human_review, [
    "Prepared audit output could not be normalized; review model/tool output before using methodology signals."
  ]);
});

test("invalid prepared JSON is reported as tool_error without methodology findings", () => {
  const parsed = parsePreparedAuditOutput("{ not json");

  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, "tool_error");
  assert.deepEqual(parsed.findings, []);
  assert.match(parsed.reason, /JSON/i);
});

test("needs_review verdict is preserved when mixed with warnings", () => {
  const preparedOutput = readJson<PreparedAuditOutput>("valid-taxonomy-output.json");
  const sourceSnapshot = readJson<SourceSnapshot>("source-snapshot.json");
  const nonBlockingOutput: PreparedAuditOutput = {
    ...preparedOutput,
    findings: preparedOutput.findings
      .filter((finding) => finding.severity !== "hard_fail")
      .map((finding) => ({
        ...finding,
        blocking: false
      }))
  };

  const report = buildMethodologyAuditReport({
    preparedOutput: nonBlockingOutput,
    sourceSnapshot,
    artifactPath: "reports/methodology-audit-report.json",
    runId: "needs-review-run"
  });

  assert.equal(report.blockingFindings, 0);
  assert.equal(report.verdict, "needs_review");
});

test("priority labels are mapped into machine severity", () => {
  const sourceSnapshot = readJson<SourceSnapshot>("source-snapshot.json");
  const rawOutput = JSON.stringify({
    checked_files: [
      {
        path: "runtime/core/canon_paf_knowledge_layer.md",
        role: "reference"
      }
    ],
    findings: [
      {
        id: "priority-p1",
        taxonomy: "lost",
        priority: "П1",
        title: "Lost PAF behavior",
        summary: "A required behavior is absent.",
        evidence: [
          {
            file: "runtime/core/canon_paf_knowledge_layer.md"
          }
        ],
        recommendation: "Restore behavior.",
        confidence: "high"
      },
      {
        id: "priority-p2",
        taxonomy: "distorted",
        priority: "П2",
        title: "Distorted PAF behavior",
        summary: "A behavior changed meaning.",
        evidence: [
          {
            file: "runtime/project_setup/example.md"
          }
        ],
        recommendation: "Align behavior.",
        confidence: "medium"
      },
      {
        id: "priority-review",
        taxonomy: "local_adaptation_candidate",
        priority: "П3",
        title: "Possible local adaptation",
        summary: "A local adaptation may be intentional.",
        evidence: [
          {
            file: "runtime/project_setup/example.md"
          }
        ],
        recommendation: "Ask the methodology owner.",
        confidence: "low"
      }
    ],
    non_findings: [],
    limitations: [],
    recommended_human_review: []
  });
  const parsed = parsePreparedAuditOutput(rawOutput);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.ok ? parsed.output.findings.map((finding) => finding.severity) : [],
    ["hard_fail", "warning", "needs_review"]
  );
  assert.deepEqual(
    parsed.ok ? parsed.output.findings.map((finding) => finding.blocking) : [],
    [true, false, false]
  );

  const report = buildMethodologyAuditReport({
    preparedOutput: parsed.ok ? parsed.output : readJson<PreparedAuditOutput>("valid-taxonomy-output.json"),
    sourceSnapshot,
    artifactPath: "reports/methodology-audit-report.json",
    runId: "priority-run"
  });

  assert.equal(report.verdict, "hard_fail");
  assert.equal(report.blockingFindings, 1);
});
