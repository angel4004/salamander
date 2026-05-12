export const METHODOLOGY_AUDIT_SCHEMA_VERSION =
  "salamander-methodology-audit-report-v0" as const;

export type ArtifactStatus =
  | "provided"
  | "tool_error"
  | "incomplete"
  | "skipped_with_waiver"
  | "not_required"
  | "missing_required";

export type AuditVerdict =
  | "pass"
  | "hard_fail"
  | "warning"
  | "needs_review"
  | "unknown";

export type FindingTaxonomy =
  | "lost"
  | "distorted"
  | "underpacked"
  | "unused"
  | "invented_strictness"
  | "local_adaptation_candidate"
  | "uncertain";

export type NonFindingTaxonomy = "acceptable_compression";
export type AuditPriority = "P1" | "P2" | "P3";

export type Severity = "hard_fail" | "warning" | "needs_review";

export interface EvidenceItem {
  file: string;
  locator?: string;
  excerpt?: string;
}

export interface CheckedFile {
  path: string;
  role: string;
  digest?: string;
}

export interface PreparedAuditFinding {
  id: string;
  taxonomy: FindingTaxonomy;
  priority?: AuditPriority;
  severity: Severity;
  title: string;
  summary: string;
  evidence: EvidenceItem[];
  recommendation: string;
  confidence: "low" | "medium" | "high";
  blocking: boolean;
}

export interface PreparedAuditNonFinding {
  id: string;
  taxonomy: NonFindingTaxonomy;
  title: string;
  summary: string;
  evidence: EvidenceItem[];
  confidence: "low" | "medium" | "high";
}

export interface PreparedAuditOutput {
  checked_files: CheckedFile[];
  findings: PreparedAuditFinding[];
  non_findings: PreparedAuditNonFinding[];
  limitations: string[];
  recommended_human_review: string[];
}

export interface SourceSnapshot {
  kind: string;
  snapshot_id: string;
  source: string;
  git?: {
    repository?: string;
    branch?: string;
    commit?: string;
  };
  captured_at?: string;
  notes?: string[];
}

export interface MethodologyAuditRun {
  id: string;
  mode: "offline_pre_merge";
  generated_at: string;
  generated_by: "salamander-offline-audit-runner";
}

export interface ToolStatus {
  status: "ok" | "schema_mismatch" | "tool_error" | "incomplete";
  reason: string;
}

export interface MethodologyAuditReport {
  status: ArtifactStatus;
  reason: string;
  artifactPath: string;
  verdict: AuditVerdict;
  blockingFindings: number;
  schemaVersion: typeof METHODOLOGY_AUDIT_SCHEMA_VERSION;
  run: MethodologyAuditRun;
  source_snapshot: SourceSnapshot;
  checked_files: CheckedFile[];
  findings: PreparedAuditFinding[];
  non_findings: PreparedAuditNonFinding[];
  tool_status: ToolStatus;
  limitations: string[];
  recommended_human_review: string[];
}

export interface BuildMethodologyAuditReportOptions {
  preparedOutput: PreparedAuditOutput;
  sourceSnapshot: SourceSnapshot;
  artifactPath: string;
  runId: string;
  generatedAt?: string;
}

export type ParsedPreparedAuditOutput =
  | {
      ok: true;
      output: PreparedAuditOutput;
    }
  | {
      ok: false;
      status: Extract<ArtifactStatus, "tool_error" | "incomplete">;
      reason: string;
      findings: [];
    };

const findingTaxonomies = new Set<string>([
  "lost",
  "distorted",
  "underpacked",
  "unused",
  "invented_strictness",
  "local_adaptation_candidate",
  "uncertain"
]);

const nonFindingTaxonomies = new Set<string>(["acceptable_compression"]);
const priorities = new Set<string>(["P1", "P2", "P3"]);
const severities = new Set<string>(["hard_fail", "warning", "needs_review"]);
const confidences = new Set<string>(["low", "medium", "high"]);

export function parsePreparedAuditOutput(rawJson: string): ParsedPreparedAuditOutput {
  try {
    const output = normalizePreparedAuditOutput(JSON.parse(rawJson) as unknown);
    const errors = [
      ...output.errors,
      ...validatePreparedAuditOutput(output.value)
    ];

    if (errors.length > 0) {
      return {
        ok: false,
        status: "incomplete",
        reason: `Prepared audit output schema mismatch: ${errors.join("; ")}`,
        findings: []
      };
    }

    return {
      ok: true,
      output: output.value as PreparedAuditOutput
    };
  } catch (error) {
    return {
      ok: false,
      status: "tool_error",
      reason: `Prepared audit output is not valid JSON: ${formatError(error)}`,
      findings: []
    };
  }
}

export function buildMethodologyAuditReport(
  options: BuildMethodologyAuditReportOptions
): MethodologyAuditReport {
  const sourceErrors = validateSourceSnapshot(options.sourceSnapshot);
  if (sourceErrors.length > 0) {
    return buildFailureReport({
      status: "incomplete",
      toolStatus: "incomplete",
      reason: `Pinned source snapshot is incomplete: ${sourceErrors.join("; ")}`,
      artifactPath: options.artifactPath,
      runId: options.runId,
      generatedAt: options.generatedAt,
      sourceSnapshot: options.sourceSnapshot
    });
  }

  const normalizedOutput = normalizePreparedAuditOutput(options.preparedOutput);
  const outputErrors = [
    ...normalizedOutput.errors,
    ...validatePreparedAuditOutput(normalizedOutput.value)
  ];
  if (outputErrors.length > 0) {
    return buildFailureReport({
      status: "incomplete",
      toolStatus: "schema_mismatch",
      reason: `Prepared audit output schema mismatch: ${outputErrors.join("; ")}`,
      artifactPath: options.artifactPath,
      runId: options.runId,
      generatedAt: options.generatedAt,
      sourceSnapshot: options.sourceSnapshot
    });
  }

  const preparedOutput = normalizedOutput.value as PreparedAuditOutput;
  const blockingFindings = preparedOutput.findings.filter(
    (finding) => finding.blocking || finding.severity === "hard_fail"
  ).length;

  return {
    status: "provided",
    reason: "Prepared methodology audit output was normalized successfully.",
    artifactPath: options.artifactPath,
    verdict: deriveVerdict(preparedOutput.findings, blockingFindings),
    blockingFindings,
    schemaVersion: METHODOLOGY_AUDIT_SCHEMA_VERSION,
    run: buildRun(options.runId, options.generatedAt),
    source_snapshot: options.sourceSnapshot,
    checked_files: preparedOutput.checked_files,
    findings: preparedOutput.findings,
    non_findings: preparedOutput.non_findings,
    tool_status: {
      status: "ok",
      reason: "Prepared audit output passed Salamander v0 validation."
    },
    limitations: preparedOutput.limitations,
    recommended_human_review: preparedOutput.recommended_human_review
  };
}

export function buildToolFailureReport(options: {
  status: Extract<ArtifactStatus, "tool_error" | "incomplete">;
  reason: string;
  artifactPath: string;
  runId: string;
  generatedAt?: string;
  sourceSnapshot?: SourceSnapshot;
}): MethodologyAuditReport {
  return buildFailureReport({
    status: options.status,
    toolStatus: options.status,
    reason: options.reason,
    artifactPath: options.artifactPath,
    runId: options.runId,
    generatedAt: options.generatedAt,
    sourceSnapshot: options.sourceSnapshot
  });
}

function buildFailureReport(options: {
  status: Extract<ArtifactStatus, "tool_error" | "incomplete">;
  toolStatus: ToolStatus["status"];
  reason: string;
  artifactPath: string;
  runId: string;
  generatedAt?: string;
  sourceSnapshot?: SourceSnapshot;
}): MethodologyAuditReport {
  return {
    status: options.status,
    reason: options.reason,
    artifactPath: options.artifactPath,
    verdict: "needs_review",
    blockingFindings: 0,
    schemaVersion: METHODOLOGY_AUDIT_SCHEMA_VERSION,
    run: buildRun(options.runId, options.generatedAt),
    source_snapshot:
      options.sourceSnapshot ??
      {
        kind: "unknown",
        snapshot_id: "",
        source: ""
      },
    checked_files: [],
    findings: [],
    non_findings: [],
    tool_status: {
      status: options.toolStatus,
      reason: options.reason
    },
    limitations: [options.reason],
    recommended_human_review: [
      "Prepared audit output could not be normalized; review model/tool output before using methodology signals."
    ]
  };
}

function buildRun(runId: string, generatedAt?: string): MethodologyAuditRun {
  return {
    id: runId,
    mode: "offline_pre_merge",
    generated_at: generatedAt ?? new Date().toISOString(),
    generated_by: "salamander-offline-audit-runner"
  };
}

function deriveVerdict(
  findings: PreparedAuditFinding[],
  blockingFindings: number
): AuditVerdict {
  if (blockingFindings > 0) {
    return "hard_fail";
  }

  if (findings.some((finding) => finding.severity === "needs_review")) {
    return "needs_review";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }

  return "pass";
}

function validatePreparedAuditOutput(output: unknown): string[] {
  const errors: string[] = [];

  if (!isRecord(output)) {
    return ["output must be an object"];
  }

  validateCheckedFiles(output.checked_files, errors);
  validateFindings(output.findings, errors);
  validateNonFindings(output.non_findings, errors);
  validateStringArray(output.limitations, "limitations", errors);
  validateStringArray(
    output.recommended_human_review,
    "recommended_human_review",
    errors
  );

  return errors;
}

function normalizePreparedAuditOutput(output: unknown): {
  value: unknown;
  errors: string[];
} {
  if (!isRecord(output)) {
    return {
      value: output,
      errors: []
    };
  }

  const errors: string[] = [];

  return {
    value: {
      checked_files: output.checked_files,
      findings: normalizeFindings(output.findings, errors),
      non_findings: normalizeNonFindings(output.non_findings),
      limitations: output.limitations,
      recommended_human_review: output.recommended_human_review
    },
    errors
  };
}

function normalizeFindings(value: unknown, errors: string[]): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((finding, index) => {
    if (!isRecord(finding)) {
      return finding;
    }

    const taxonomy = typeof finding.taxonomy === "string" ? finding.taxonomy : "";
    const priority = normalizePriority(finding.priority);
    if (finding.priority !== undefined && !priority) {
      errors.push(`findings[${index}].priority is invalid`);
    }

    const explicitSeverity =
      typeof finding.severity === "string" ? finding.severity : undefined;
    const severity = explicitSeverity ?? mapPriorityToSeverity(priority, taxonomy);
    const blocking =
      typeof finding.blocking === "boolean"
        ? finding.blocking
        : severity === "hard_fail";

    return {
      id: finding.id,
      taxonomy: finding.taxonomy,
      ...(priority ? { priority } : {}),
      severity,
      title: finding.title,
      summary: finding.summary,
      evidence: finding.evidence,
      recommendation: finding.recommendation,
      confidence: finding.confidence,
      blocking
    };
  });
}

function normalizeNonFindings(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((nonFinding) => {
    if (!isRecord(nonFinding)) {
      return nonFinding;
    }

    return {
      id: nonFinding.id,
      taxonomy: nonFinding.taxonomy,
      title: nonFinding.title,
      summary: nonFinding.summary,
      evidence: nonFinding.evidence,
      confidence: nonFinding.confidence
    };
  });
}

function normalizePriority(value: unknown): AuditPriority | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  switch (value.trim().toUpperCase()) {
    case "P1":
    case "\u041F1":
      return "P1";
    case "P2":
    case "\u041F2":
      return "P2";
    case "P3":
    case "\u041F3":
      return "P3";
    default:
      return undefined;
  }
}

function mapPriorityToSeverity(
  priority: AuditPriority | undefined,
  taxonomy: string
): Severity | undefined {
  if (taxonomy === "local_adaptation_candidate" || taxonomy === "uncertain") {
    return "needs_review";
  }

  if (priority === "P1") {
    return "hard_fail";
  }

  if (priority === "P2" || priority === "P3") {
    return "warning";
  }

  return undefined;
}

function validateSourceSnapshot(snapshot: SourceSnapshot): string[] {
  const errors: string[] = [];

  if (!isRecord(snapshot)) {
    return ["source snapshot must be an object"];
  }

  if (!nonEmptyString(snapshot.kind)) {
    errors.push("source snapshot kind is required");
  }
  if (!nonEmptyString(snapshot.snapshot_id)) {
    errors.push("source snapshot snapshot_id is required");
  }
  if (!nonEmptyString(snapshot.source)) {
    errors.push("source snapshot source is required");
  }

  return errors;
}

function validateCheckedFiles(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("checked_files must be an array");
    return;
  }

  value.forEach((file, index) => {
    if (!isRecord(file)) {
      errors.push(`checked_files[${index}] must be an object`);
      return;
    }

    if (!nonEmptyString(file.path)) {
      errors.push(`checked_files[${index}].path is required`);
    }
    if (!nonEmptyString(file.role)) {
      errors.push(`checked_files[${index}].role is required`);
    }
  });
}

function validateFindings(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("findings must be an array");
    return;
  }

  value.forEach((finding, index) => {
    if (!isRecord(finding)) {
      errors.push(`findings[${index}] must be an object`);
      return;
    }

    validateCommonAuditItem(finding, `findings[${index}]`, errors);

    if (finding.taxonomy === "acceptable_compression") {
      errors.push("acceptable_compression must be a non_finding, not a finding");
    } else if (!findingTaxonomies.has(String(finding.taxonomy))) {
      errors.push(`findings[${index}].taxonomy is not in Salamander v0 taxonomy`);
    }

    if (finding.priority !== undefined && !priorities.has(String(finding.priority))) {
      errors.push(`findings[${index}].priority is invalid`);
    }
    if (!severities.has(String(finding.severity))) {
      errors.push(`findings[${index}].severity is invalid`);
    }
    if (!nonEmptyString(finding.recommendation)) {
      errors.push(`findings[${index}].recommendation is required`);
    }
    if (typeof finding.blocking !== "boolean") {
      errors.push(`findings[${index}].blocking must be boolean`);
    }
  });
}

function validateNonFindings(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push("non_findings must be an array");
    return;
  }

  value.forEach((nonFinding, index) => {
    if (!isRecord(nonFinding)) {
      errors.push(`non_findings[${index}] must be an object`);
      return;
    }

    validateCommonAuditItem(nonFinding, `non_findings[${index}]`, errors);

    if (!nonFindingTaxonomies.has(String(nonFinding.taxonomy))) {
      errors.push(`non_findings[${index}].taxonomy must be acceptable_compression`);
    }
  });
}

function validateCommonAuditItem(
  item: Record<string, unknown>,
  path: string,
  errors: string[]
): void {
  if (!nonEmptyString(item.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!nonEmptyString(item.title)) {
    errors.push(`${path}.title is required`);
  }
  if (!nonEmptyString(item.summary)) {
    errors.push(`${path}.summary is required`);
  }
  if (!confidences.has(String(item.confidence))) {
    errors.push(`${path}.confidence is invalid`);
  }
  validateEvidence(item.evidence, `${path}.evidence`, errors);
}

function validateEvidence(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((evidence, index) => {
    if (!isRecord(evidence)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }

    if (!nonEmptyString(evidence.file)) {
      errors.push(`${path}[${index}].file is required`);
    }
  });
}

function validateStringArray(
  value: unknown,
  path: string,
  errors: string[]
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${path}[${index}] must be a string`);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return String(error);
}
