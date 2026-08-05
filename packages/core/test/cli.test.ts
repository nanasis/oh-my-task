import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli, type CliIo } from "../src/cli.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "omt-cli-"));
  const output: string[] = []; const errors: string[] = [];
  const io: CliIo = {
    out: (value) => output.push(value), error: (value) => errors.push(value), cwd: root,
    env: { OH_MY_TASK_HOME: join(root, "state") },
  };
  return { root, output, errors, io, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("CLI task lifecycle is scriptable through JSON", async () => {
  const { io, output, errors, cleanup } = await fixture();
  try {
    assert.equal(await runCli(["config-init"], io), 0);
    assert.equal(await runCli(["new", "--title", "CLI task", "--project", "app", "--json"], io), 0);
    const created = JSON.parse(output.at(-1)!) as { metadata: { id: string; revision: number } };
    assert.equal(created.metadata.revision, 0);

    output.length = 0;
    assert.equal(await runCli(["list", "--project", "app", "--json"], io), 0);
    const listed = JSON.parse(output[0]!) as unknown[];
    assert.equal(listed.length, 1);

    const checkpoint = JSON.stringify({
      baseRevision: 0,
      progress: "CLI checkpoint works.",
      nextAction: "Complete it.",
    });
    output.length = 0;
    assert.equal(await runCli(["checkpoint", created.metadata.id, "--data", checkpoint, "--json"], io), 0);
    const updated = JSON.parse(output[0]!) as { metadata: { revision: number } };
    assert.equal(updated.metadata.revision, 1);
    assert.equal(await runCli(["validate", "--json"], io), 0);
    assert.equal(errors.length, 0);
  } finally { await cleanup(); }
});

test("CLI imports a plan by copying normalized items", async () => {
  const { root, io, output, cleanup } = await fixture();
  try {
    const plan = join(root, "PLAN.md");
    await writeFile(plan, "# Plan\n\n## Objective\n\nShip the feature.\n\n- [ ] First step\n- [x] Finished step\n");
    assert.equal(await runCli(["new", "--title", "Imported", "--project", "app", "--plan", plan, "--json"], io), 0);
    const task = JSON.parse(output.at(-1)!) as { metadata: { id: string; sourcePlan: { path: string } } };
    assert.equal(task.metadata.sourcePlan.path, plan);
    const taskFile = join(root, "state", "tasks", `${task.metadata.id}.md`);
    const source = await readFile(taskFile, "utf8");
    assert.match(source, /Ship the feature/);
    assert.match(source, /\[ \] \*\*first-step\*\*/);
    assert.match(source, /\[x\] \*\*finished-step\*\*/);
  } finally { await cleanup(); }
});

test("internal cross-agent tools discover tasks and return resume context", async () => {
  const { root, io, output, cleanup } = await fixture();
  try {
    await runCli(["new", "--title", "Portable task", "--project", "app", "--json"], io);
    const created = JSON.parse(output.at(-1)!) as { metadata: { id: string; revision: number } };
    await runCli([
      "associate", created.metadata.id, "--base-revision", "0", "--agent", "pi", "--session", "pi-session", "--cwd", root,
    ], io);
    output.length = 0;
    assert.equal(await runCli(["workspace-tasks", "--json"], io), 0);
    const discovery = JSON.parse(output[0]!) as { projectName: string; tasks: Array<{ id: string }> };
    assert.equal(discovery.projectName, "app");
    assert.deepEqual(discovery.tasks.map((task) => task.id), [created.metadata.id]);

    output.length = 0;
    assert.equal(await runCli([
      "resume-context", created.metadata.id, "--agent", "codex-cli", "--session", "codex-session", "--cwd", root, "--json",
    ], io), 0);
    const resume = JSON.parse(output[0]!) as { agentSwitch: boolean; context: string; task: { revision: number }; recentSessions: unknown[] };
    assert.equal(resume.agentSwitch, true);
    assert.match(resume.context, /Agent switch: pi → codex-cli/);
    assert.match(resume.context, /Portable task/);
    assert.equal(resume.task.revision, 2);
    assert.equal(resume.recentSessions.length, 2);
  } finally { await cleanup(); }
});

test("CLI returns stable usage and stale-revision codes", async () => {
  const { io, output, errors, cleanup } = await fixture();
  try {
    assert.equal(await runCli(["unknown"], io), 64);
    assert.match(errors.at(-1)!, /unknown command/);
    errors.length = 0;
    await runCli(["new", "--title", "Conflict", "--project", "app", "--json"], io);
    const task = JSON.parse(output.at(-1)!) as { metadata: { id: string } };
    await runCli(["archive", task.metadata.id, "--base-revision", "0"], io);
    assert.equal(await runCli(["archive", task.metadata.id, "--base-revision", "0"], io), 76);
    assert.match(errors.at(-1)!, /Reload and merge/);
  } finally { await cleanup(); }
});
