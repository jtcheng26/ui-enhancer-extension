import { logger } from "@/utils/logger";

const AGENT_LOG_STORAGE_KEY = "aui-agent-run-logs";
const MAX_STORED_AGENT_LOGS = 20;

export interface AgentRunLogEntry {
  id: string;
  runId: string;
  type: string;
  timestamp: string;
  payload?: unknown;
}

export interface AgentRunLog {
  id: string;
  startedAt: string;
  updatedAt: string;
  prompt: string;
  mode: string;
  source: string;
  options: Record<string, unknown>;
  entries: AgentRunLogEntry[];
}

declare global {
  interface Window {
    __AUI_AGENT_LOGS__?: AgentRunLog[];
    __AUI_LAST_AGENT_LOG__?: AgentRunLog;
    __AUI_EXPORT_AGENT_LOGS__?: () => string;
  }
}

function getWindowAgentLogs() {
  if (typeof window === "undefined") {
    return [];
  }

  window.__AUI_AGENT_LOGS__ ??= [];
  window.__AUI_EXPORT_AGENT_LOGS__ ??= () =>
    JSON.stringify(window.__AUI_AGENT_LOGS__ ?? [], null, 2);

  return window.__AUI_AGENT_LOGS__;
}

function getStoredAgentLogs() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(AGENT_LOG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentRunLog[]) : [];
  } catch {
    return [];
  }
}

function persistAgentLogs(logs: AgentRunLog[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      AGENT_LOG_STORAGE_KEY,
      JSON.stringify(logs.slice(-MAX_STORED_AGENT_LOGS)),
    );
  } catch {
    logger.warn("Unable to persist agent run logs to localStorage.");
  }
}

function upsertAgentLog(log: AgentRunLog) {
  const windowLogs = getWindowAgentLogs();
  const existingWindowIndex = windowLogs.findIndex((item) => item.id === log.id);

  if (existingWindowIndex === -1) {
    windowLogs.push(log);
  } else {
    windowLogs[existingWindowIndex] = log;
  }

  window.__AUI_LAST_AGENT_LOG__ = log;

  const storedLogs = getStoredAgentLogs();
  const existingStoredIndex = storedLogs.findIndex((item) => item.id === log.id);
  const nextStoredLogs =
    existingStoredIndex === -1
      ? [...storedLogs, log]
      : storedLogs.map((item) => (item.id === log.id ? log : item));

  persistAgentLogs(nextStoredLogs);
}

export function startAgentRunLog(input: {
  prompt: string;
  mode: string;
  source: string;
  options?: Record<string, unknown>;
}) {
  const log: AgentRunLog = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prompt: input.prompt,
    mode: input.mode,
    source: input.source,
    options: input.options ?? {},
    entries: [],
  };

  upsertAgentLog(log);
  appendAgentRunLog(log, "run_started", {
    prompt: input.prompt,
    mode: input.mode,
    source: input.source,
    options: input.options ?? {},
  });

  return log;
}

export function appendAgentRunLog(
  log: AgentRunLog | null,
  type: string,
  payload?: unknown,
) {
  if (!log) {
    return null;
  }

  const entry: AgentRunLogEntry = {
    id: crypto.randomUUID(),
    runId: log.id,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };

  log.updatedAt = entry.timestamp;
  log.entries.push(entry);
  upsertAgentLog(log);

  logger.info(`[agent:${log.id}] ${type}`, payload);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("aui-agent-log-entry", {
        detail: {
          log,
          entry,
        },
      }),
    );
  }

  return entry;
}
