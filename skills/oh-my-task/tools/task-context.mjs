#!/usr/bin/env node
/** Agent-facing internal tool for cross-agent task discovery and context resume. */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skillDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = resolve(skillDirectory, "cli.mjs");
const [action = "help", ...args] = process.argv.slice(2);
const mapped = action === "list"
  ? ["workspace-tasks", ...args, "--json"]
  : action === "resume"
    ? ["resume-context", ...args, "--json"]
    : [];

if (!mapped.length) {
  console.error("Internal usage: task-context.mjs list [--project NAME] [--include-closed] | resume TASK [--agent NAME --session ID --cwd PATH]");
  process.exitCode = 64;
} else {
  const child = spawn(process.execPath, [launcher, ...mapped], { stdio: "inherit", cwd: process.cwd(), env: process.env });
  child.once("error", (error) => { throw error; });
  child.once("exit", (code) => { process.exitCode = code ?? 1; });
}
