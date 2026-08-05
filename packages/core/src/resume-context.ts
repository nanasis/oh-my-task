import { resolve } from "node:path";
import type { SessionReference, TaskDocument, TaskMetadata } from "./types.js";
import { suggestProjectName } from "./project.js";
import { workspaceKey } from "./project-links.js";

const RESUMABLE_STATUSES = new Set(["planned", "in-progress", "blocked"]);
const CONTEXT_SECTIONS = ["Objective", "Constraints", "Plan", "Current State"];

export interface TaskListItem {
  id: string;
  title: string;
  status: TaskMetadata["status"];
  revision: number;
  projectName: string;
  progressSummary: string;
  nextAction: string;
  activePlanItem?: string;
  updatedAt: string;
  latestSession?: SessionReference;
}

export interface WorkspaceTaskDiscovery {
  cwd: string;
  suggestedProjectName: string;
  projectName?: string;
  projectCandidates: string[];
  requiresProjectApproval: boolean;
  filteringExplanation?: string;
  tasks: TaskListItem[];
}

export interface ResumeContextBundle {
  task: TaskListItem;
  context: string;
  recentSessions: SessionReference[];
  agentSwitch: boolean;
  sourcePlanPath?: string;
}

export function discoverWorkspaceTasks(
  tasks: TaskDocument[],
  cwd: string,
  options: { linkedProjectName?: string; projectName?: string; includeClosed?: boolean } = {},
): WorkspaceTaskDiscovery {
  const normalizedCwd = workspaceKey(cwd);
  const inferred = new Set<string>();
  for (const task of tasks) {
    if (sessionsFromTask(task).some((session) => workspaceKey(session.cwd) === normalizedCwd)) {
      inferred.add(task.metadata.project.name);
    }
  }
  const projectCandidates = [...inferred].sort();
  const projectName = options.projectName ?? options.linkedProjectName ?? (projectCandidates.length === 1 ? projectCandidates[0] : undefined);
  const visible = tasks
    .filter((task) => Boolean(projectName) && task.metadata.project.name === projectName)
    .filter((task) => options.includeClosed || RESUMABLE_STATUSES.has(task.metadata.status))
    .sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt) || a.metadata.id.localeCompare(b.metadata.id))
    .map(toTaskListItem);
  return {
    cwd: resolve(cwd),
    suggestedProjectName: suggestProjectName(cwd),
    ...(projectName ? { projectName } : {}),
    projectCandidates,
    requiresProjectApproval: !projectName,
    ...(projectName ? {
      filteringExplanation: `Other tasks are hidden because they are not related to the ${projectName} project.`,
    } : {}),
    tasks: visible,
  };
}

export function buildResumeContextBundle(
  task: TaskDocument,
  currentAgent?: string,
  sessionLimit = 5,
  previousAgent?: string,
): ResumeContextBundle {
  const sections = CONTEXT_SECTIONS.map((name) => extractSection(task.body, name)).filter(Boolean);
  const latestCheckpoint = extractLatestCheckpoint(task.body);
  if (latestCheckpoint) sections.push(`## Latest Checkpoint\n\n${latestCheckpoint}`);
  const recentSessions = sessionsFromTask(task)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, sessionLimit);
  const latestAgent = previousAgent ?? task.metadata.latestSession?.agent;
  const agentSwitch = Boolean(currentAgent && latestAgent && currentAgent.toLowerCase() !== latestAgent.toLowerCase());
  const item = toTaskListItem(task);
  const context = [
    "# Oh My Task Resume Context",
    "",
    `Task: ${item.title}`,
    `Task ID: ${item.id}`,
    `Revision: ${item.revision}`,
    `Status: ${item.status}`,
    `Project: ${item.projectName}`,
    ...(agentSwitch ? [`Agent switch: ${latestAgent} → ${currentAgent}. Resume from this task context; do not attempt to load the other agent's session.`] : []),
    "",
    ...sections,
    "",
    `## Resume Instruction\n\nContinue with: ${item.nextAction}\n\nTreat this task document as the source of truth. Verify repository state before changing plan status.`,
  ].join("\n");
  return {
    task: item,
    context,
    recentSessions,
    agentSwitch,
    ...(task.metadata.sourcePlan ? { sourcePlanPath: task.metadata.sourcePlan.path } : {}),
  };
}

export function sessionsFromTask(task: TaskDocument): SessionReference[] {
  const byIdentity = new Map<string, SessionReference>();
  if (task.metadata.latestSession) {
    const value = task.metadata.latestSession;
    byIdentity.set(`${value.agent}\u0000${value.sessionId}`, value);
  }
  const section = extractRawSection(task.body, "Sessions");
  for (const match of section.matchAll(/^- ([^—]+) — `([^`]+)` — `([^`]+)` — last used (.+)$/gm)) {
    const value = { agent: match[1]!.trim(), sessionId: match[2]!, cwd: match[3]!, updatedAt: match[4]!.trim() };
    byIdentity.set(`${value.agent}\u0000${value.sessionId}`, value);
  }
  return [...byIdentity.values()];
}

function toTaskListItem(task: TaskDocument): TaskListItem {
  const metadata = task.metadata;
  return {
    id: metadata.id,
    title: metadata.title,
    status: metadata.status,
    revision: metadata.revision,
    projectName: metadata.project.name,
    progressSummary: metadata.progressSummary ?? "Not started",
    nextAction: metadata.nextAction ?? "Develop or confirm the implementation plan.",
    ...(metadata.activePlanItem ? { activePlanItem: metadata.activePlanItem } : {}),
    updatedAt: metadata.updatedAt,
    ...(metadata.latestSession ? { latestSession: metadata.latestSession } : {}),
  };
}

function extractSection(body: string, heading: string): string {
  const value = extractRawSection(body, heading);
  return value ? `## ${heading}\n\n${value}` : "";
}

function extractRawSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(body)?.[1]?.trim() ?? "";
}

function extractLatestCheckpoint(body: string): string {
  const history = extractRawSection(body, "Checkpoint History");
  const matches = [...history.matchAll(/^### Checkpoint \d+ —[^\n]*\n([\s\S]*?)(?=^### Checkpoint |(?![\s\S]))/gm)];
  const latest = matches.at(-1);
  return latest ? `${latest[0].trim()}` : "";
}
