import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  buildMethodologyAuditReport,
  buildToolFailureReport,
  parsePreparedAuditOutput,
  type MethodologyAuditReport,
  type SourceSnapshot
} from "./auditReport.js";

export interface OfflineAuditRunnerOptions {
  modelOutputPath: string;
  sourceSnapshotPath: string;
  outputDir: string;
  runId?: string;
  artifactName?: string;
}

export interface OfflineAuditRunnerResult {
  report: MethodologyAuditReport;
  jsonPath: string;
  markdownPath: string;
}

export async function runOfflineAudit(
  options: OfflineAuditRunnerOptions
): Promise<OfflineAuditRunnerResult> {
  const artifactName = options.artifactName ?? "methodology-audit-report";
  const jsonPath = join(options.outputDir, `${artifactName}.json`);
  const markdownPath = join(options.outputDir, `${artifactName}.md`);
  const runId = options.runId ?? `offline-${Date.now()}`;

  await mkdir(options.outputDir, { recursive: true });

  const sourceSnapshot = await readSourceSnapshot(options.sourceSnapshotPath);
  const modelOutput = await readModelOutput(options.modelOutputPath);

  const report = buildReport({
    modelOutput,
    sourceSnapshot,
    jsonPath,
    runId
  });

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMethodologyAuditMarkdown(report), "utf8");

  return {
    report,
    jsonPath,
    markdownPath
  };
}

function buildReport(options: {
  modelOutput:
    | { ok: true; rawJson: string }
    | { ok: false; status: "tool_error"; reason: string };
  sourceSnapshot:
    | { ok: true; snapshot: SourceSnapshot }
    | { ok: false; reason: string; snapshot?: SourceSnapshot };
  jsonPath: string;
  runId: string;
}): MethodologyAuditReport {
  if (!options.sourceSnapshot.ok) {
    return buildToolFailureReport({
      status: "incomplete",
      reason: options.sourceSnapshot.reason,
      artifactPath: options.jsonPath,
      runId: options.runId,
      sourceSnapshot: options.sourceSnapshot.snapshot
    });
  }

  if (!options.modelOutput.ok) {
    return buildToolFailureReport({
      status: "tool_error",
      reason: options.modelOutput.reason,
      artifactPath: options.jsonPath,
      runId: options.runId,
      sourceSnapshot: options.sourceSnapshot.snapshot
    });
  }

  const parsedOutput = parsePreparedAuditOutput(options.modelOutput.rawJson);
  if (!parsedOutput.ok) {
    return buildToolFailureReport({
      status: parsedOutput.status,
      reason: parsedOutput.reason,
      artifactPath: options.jsonPath,
      runId: options.runId,
      sourceSnapshot: options.sourceSnapshot.snapshot
    });
  }

  return buildMethodologyAuditReport({
    preparedOutput: parsedOutput.output,
    sourceSnapshot: options.sourceSnapshot.snapshot,
    artifactPath: options.jsonPath,
    runId: options.runId
  });
}

async function readSourceSnapshot(
  sourceSnapshotPath: string
): Promise<
  | { ok: true; snapshot: SourceSnapshot }
  | { ok: false; reason: string; snapshot?: SourceSnapshot }
> {
  try {
    const rawJson = await readFile(sourceSnapshotPath, "utf8");
    const snapshot = JSON.parse(rawJson) as SourceSnapshot;

    return {
      ok: true,
      snapshot
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Pinned source snapshot could not be read: ${formatError(error)}`
    };
  }
}

async function readModelOutput(
  modelOutputPath: string
): Promise<{ ok: true; rawJson: string } | { ok: false; status: "tool_error"; reason: string }> {
  try {
    return {
      ok: true,
      rawJson: await readFile(modelOutputPath, "utf8")
    };
  } catch (error) {
    return {
      ok: false,
      status: "tool_error",
      reason: `Prepared model output could not be read: ${formatError(error)}`
    };
  }
}

export function renderMethodologyAuditMarkdown(
  report: MethodologyAuditReport
): string {
  const lines = [
    "# Salamander Methodology Audit Report",
    "",
    `- schemaVersion: ${report.schemaVersion}`,
    `- status: ${report.status}`,
    `- verdict: ${report.verdict}`,
    `- blockingFindings: ${report.blockingFindings}`,
    `- artifactPath: ${report.artifactPath}`,
    `- reason: ${report.reason}`,
    "",
    "## Source Snapshot",
    "",
    `- kind: ${report.source_snapshot.kind}`,
    `- snapshot_id: ${report.source_snapshot.snapshot_id || "(missing)"}`,
    `- source: ${report.source_snapshot.source || "(missing)"}`,
    "",
    "## Findings",
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("No methodology findings emitted.");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.taxonomy}: ${finding.title} (${finding.id})`
      );
    }
  }

  lines.push("", "## Non-findings", "");
  if (report.non_findings.length === 0) {
    lines.push("No non-findings emitted.");
  } else {
    for (const nonFinding of report.non_findings) {
      lines.push(`- ${nonFinding.taxonomy}: ${nonFinding.title} (${nonFinding.id})`);
    }
  }

  lines.push("", "## Limitations", "");
  if (report.limitations.length === 0) {
    lines.push("No limitations reported.");
  } else {
    for (const limitation of report.limitations) {
      lines.push(`- ${limitation}`);
    }
  }

  lines.push("", "## Recommended Human Review", "");
  if (report.recommended_human_review.length === 0) {
    lines.push("No human review recommendations reported.");
  } else {
    for (const review of report.recommended_human_review) {
      lines.push(`- ${review}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function isOfflineAuditRunnerEntrypoint(entryPoint: string | undefined): boolean {
  return /(?:^|[\\/])offlineAuditRunner\.(?:ts|js)$/u.test(entryPoint ?? "");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return String(error);
}

function parseCliArgs(argv: string[]): OfflineAuditRunnerOptions {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(
        "Usage: offlineAuditRunner --model-output <path> --source-snapshot <path> --out-dir <path> [--run-id <id>] [--artifact-name <name>]"
      );
    }

    args.set(key, value);
  }

  const modelOutputPath = args.get("--model-output");
  const sourceSnapshotPath = args.get("--source-snapshot");
  const outputDir = args.get("--out-dir");

  if (!modelOutputPath || !sourceSnapshotPath || !outputDir) {
    throw new Error(
      "Missing required args: --model-output, --source-snapshot and --out-dir are required."
    );
  }

  return {
    modelOutputPath,
    sourceSnapshotPath,
    outputDir,
    runId: args.get("--run-id"),
    artifactName: args.get("--artifact-name")
  };
}

async function main(): Promise<void> {
  const result = await runOfflineAudit(parseCliArgs(process.argv.slice(2)));
  const reportName = basename(result.jsonPath);

  console.log(
    JSON.stringify(
      {
        status: result.report.status,
        verdict: result.report.verdict,
        blockingFindings: result.report.blockingFindings,
        artifactPath: result.jsonPath,
        markdownPath: result.markdownPath,
        artifactName: reportName
      },
      null,
      2
    )
  );
}

if (isOfflineAuditRunnerEntrypoint(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(formatError(error));
    process.exitCode = 1;
  });
}
