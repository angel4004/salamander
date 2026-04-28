import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CpoSourceStatus =
  | "not_configured"
  | "missing"
  | "not_git_repo"
  | "auto_update_disabled"
  | "updated"
  | "update_failed";

export interface CpoSourceSyncOptions {
  repositoryPath?: string;
  githubUrl: string;
  branch: string;
  autoUpdate: boolean;
}

export interface CpoSourceSnapshot {
  status: CpoSourceStatus;
  githubUrl: string;
  repositoryPath?: string;
  branch: string;
  autoUpdate: boolean;
  head?: string;
  details: string;
}

export async function getCpoSourceSnapshot(
  options: CpoSourceSyncOptions
): Promise<CpoSourceSnapshot> {
  if (!options.repositoryPath) {
    return {
      status: "not_configured",
      githubUrl: options.githubUrl,
      branch: options.branch,
      autoUpdate: options.autoUpdate,
      details: "CPO_REPOSITORY_PATH is not configured."
    };
  }

  if (!existsSync(options.repositoryPath)) {
    return {
      status: "missing",
      githubUrl: options.githubUrl,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      autoUpdate: options.autoUpdate,
      details: "Configured CPO repository path does not exist."
    };
  }

  if (!existsSync(join(options.repositoryPath, ".git"))) {
    return {
      status: "not_git_repo",
      githubUrl: options.githubUrl,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      autoUpdate: options.autoUpdate,
      details: "Configured CPO repository path exists but is not a Git checkout."
    };
  }

  if (!options.autoUpdate) {
    return {
      status: "auto_update_disabled",
      githubUrl: options.githubUrl,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      autoUpdate: false,
      head: await readGitHead(options.repositoryPath),
      details: "CPO auto-update is disabled; using the current local checkout."
    };
  }

  try {
    await runGit(options.repositoryPath, ["fetch", "--prune", "origin", options.branch]);
    await runGit(options.repositoryPath, ["pull", "--ff-only", "origin", options.branch]);

    return {
      status: "updated",
      githubUrl: options.githubUrl,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      autoUpdate: true,
      head: await readGitHead(options.repositoryPath),
      details: "CPO checkout was refreshed with git fetch and fast-forward pull."
    };
  } catch (error) {
    return {
      status: "update_failed",
      githubUrl: options.githubUrl,
      repositoryPath: options.repositoryPath,
      branch: options.branch,
      autoUpdate: true,
      head: await readGitHead(options.repositoryPath),
      details: `CPO checkout update failed: ${formatError(error)}`
    };
  }
}

async function readGitHead(repositoryPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await runGit(repositoryPath, ["rev-parse", "--short", "HEAD"]);

    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function runGit(
  repositoryPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", repositoryPath, ...args], {
    maxBuffer: 1024 * 1024,
    timeout: 60_000
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return String(error);
}
