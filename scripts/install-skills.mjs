#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "skills", "oh-my-task");
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Install the Oh My Task agent skill and its bundled runtime.

Usage:
  npx --yes github:nanasis/oh-my-task
  npx --yes github:nanasis/oh-my-task --path <skill-directory>

Default:
  ~/.agents/skills/oh-my-task

Use --path only when your coding agent documents a different global skill directory.`);
  process.exit(0);
}

const pathIndex = args.indexOf("--path");
if (pathIndex >= 0 && !args[pathIndex + 1]) {
  console.error("Error: --path requires the destination oh-my-task skill directory.");
  process.exit(64);
}
const unknown = args.filter((value, index) => value !== "--path" && index !== pathIndex + 1);
if (unknown.length) {
  console.error(`Unknown argument: ${unknown[0]}. Run with --help for usage.`);
  process.exit(64);
}

const requested = pathIndex >= 0 ? args[pathIndex + 1] : undefined;
const target = requested ? resolve(requested) : join(homedir(), ".agents", "skills", "oh-my-task");

await mkdir(dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await cp(join(root, "packages", "core", "dist"), join(target, "runtime"), { recursive: true });

console.log("✓ Oh My Task installed");
console.log(`  ${target}`);
console.log("\nInvoke it from your coding agent as /skill:oh-my-task or with the agent's equivalent skill syntax.");
