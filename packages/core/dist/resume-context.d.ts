import type { SessionReference, TaskDocument, TaskMetadata } from "./types.js";
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
export declare function discoverWorkspaceTasks(tasks: TaskDocument[], cwd: string, options?: {
    linkedProjectName?: string;
    projectName?: string;
    includeClosed?: boolean;
}): WorkspaceTaskDiscovery;
export declare function buildResumeContextBundle(task: TaskDocument, currentAgent?: string, sessionLimit?: number, previousAgent?: string): ResumeContextBundle;
export declare function sessionsFromTask(task: TaskDocument): SessionReference[];
//# sourceMappingURL=resume-context.d.ts.map