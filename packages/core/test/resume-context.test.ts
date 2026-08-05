import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResumeContextBundle, discoverWorkspaceTasks, type TaskDocument } from "../src/index.js";

function task(overrides: Partial<TaskDocument["metadata"]> = {}): TaskDocument {
  return {
    metadata: {
      schemaVersion: 1,
      id: "omt-20260721-deploy-a1b2c3",
      title: "Build deploy v2",
      status: "in-progress",
      revision: 8,
      createdAt: "2026-07-20T00:00:00Z",
      updatedAt: "2026-07-21T10:00:00Z",
      project: { name: "CopilotEGP" },
      progressSummary: "Deployment path implemented.",
      nextAction: "Verify rollback behavior.",
      latestSession: { agent: "pi", sessionId: "pi-1", cwd: "/work/CopilotEGP", updatedAt: "2026-07-21T10:00:00Z" },
      ...overrides,
    },
    body: `# Build deploy v2

## Objective

Ship deployment v2.

## Constraints

- Preserve rollback.

## Plan

- [x] **deploy** — Implement deployment
- [>] **rollback** — Verify rollback

## Current State

### Progress

Deployment implemented.

### Next Action

Verify rollback behavior.

## Sessions

- pi — \`pi-1\` — \`/work/CopilotEGP\` — last used 2026-07-21T10:00:00Z
- codex-cli — \`codex-old\` — \`/work/CopilotEGP\` — last used 2026-07-20T09:00:00Z

## Checkpoint History

### Checkpoint 1 — 2026-07-20T09:00:00Z

- **Progress:** Initial work

### Checkpoint 2 — 2026-07-21T10:00:00Z

- **Progress:** Deployment implemented
`,
  };
}

test("workspace discovery infers project and returns resumable task projections", () => {
  const other = task({ id: "omt-20260721-other-a1b2c3", title: "Other", project: { name: "OtherProject" }, latestSession: undefined });
  other.body = other.body.replaceAll("/work/CopilotEGP", "/work/OtherProject");
  const result = discoverWorkspaceTasks([
    task(),
    task({ id: "omt-20260721-done-a1b2c3", title: "Done", status: "completed" }),
    other,
  ], "/work/CopilotEGP");
  assert.equal(result.projectName, "CopilotEGP");
  assert.equal(result.requiresProjectApproval, false);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0]?.title, "Build deploy v2");
  assert.match(result.filteringExplanation!, /not related to the CopilotEGP project/);
});

test("unlinked workspace requests approval without exposing unrelated tasks", () => {
  const result = discoverWorkspaceTasks([task()], "/work/new-project");
  assert.equal(result.requiresProjectApproval, true);
  assert.equal(result.suggestedProjectName, "new-project");
  assert.equal(result.tasks.length, 0, "tasks remain hidden until the project is approved");
});

test("resume bundle is self-contained and signals cross-agent handoff", () => {
  const result = buildResumeContextBundle(task(), "codex-cli", 3);
  assert.equal(result.agentSwitch, true);
  assert.match(result.context, /Agent switch: pi → codex-cli/);
  assert.match(result.context, /## Objective/);
  assert.match(result.context, /## Plan/);
  assert.match(result.context, /## Current State/);
  assert.match(result.context, /Checkpoint 2/);
  assert.doesNotMatch(result.context, /Checkpoint 1/);
  assert.match(result.context, /Continue with: Verify rollback behavior/);
  assert.deepEqual(result.recentSessions.map((session) => session.agent), ["pi", "codex-cli"]);
});
