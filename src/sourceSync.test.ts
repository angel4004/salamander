import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { getCpoSourceSnapshot } from "./sourceSync.js";

test("getCpoSourceSnapshot reports missing repository path", async () => {
  const snapshot = await getCpoSourceSnapshot({
    repositoryPath: join(tmpdir(), "openclaw-cpo-missing"),
    githubUrl: "https://github.com/angel4004/cpo",
    branch: "main",
    autoUpdate: true
  });

  assert.equal(snapshot.status, "missing");
});

test("getCpoSourceSnapshot reports non-git directories", async () => {
  const snapshot = await getCpoSourceSnapshot({
    repositoryPath: mkdtempSync(join(tmpdir(), "openclaw-cpo-source-")),
    githubUrl: "https://github.com/angel4004/cpo",
    branch: "main",
    autoUpdate: true
  });

  assert.equal(snapshot.status, "not_git_repo");
});
