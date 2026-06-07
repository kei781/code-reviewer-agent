export type OrchestratorRuntimeState =
  | "REVIEWING"
  | "FIXING"
  | "VERIFYING"
  | "CONVERGING"
  | "CONVERGED_CLEAN"
  | "STALLED_OSCILLATING"
  | "CAPPED_WITH_OPEN"
  | "HUMAN_REVIEW_REQUIRED";

export type OrchestratorTerminalState = "CONVERGED_CLEAN" | "STALLED_OSCILLATING" | "CAPPED_WITH_OPEN";
export type OrchestratorMarkerAuthority = "audit-only";

export interface OrchestratorStateMarkerSource {
  readonly commentAuthorLogin: string;
  readonly trustedOrchestratorLogins: readonly string[];
}

export interface OrchestratorStateMarkers {
  readonly trustedSource: boolean;
  readonly authority: OrchestratorMarkerAuthority;
  readonly state?: OrchestratorRuntimeState;
  readonly terminalState?: OrchestratorTerminalState;
  readonly epoch?: number;
  readonly lastReviewerReviewedSha?: string;
  readonly lastFixerFixedSha?: string;
  readonly fixAttempts?: number;
  readonly processedActionableIds: readonly string[];
  readonly processedBlockerIds: readonly string[];
  readonly blockerHistory?: string;
  readonly lastFixerRunId?: string;
}

const markerPattern = /<!--\s*ai-orchestrator:(?<attributes>.*?)\s*-->/gsu;
const keyPattern = /(?<key>[a-z-]+)=/gu;

export function parseOrchestratorStateMarkers(
  markdown: string,
  source: OrchestratorStateMarkerSource
): OrchestratorStateMarkers {
  const trustedSource = isTrustedOrchestratorSource(source);
  if (!trustedSource) {
    return emptyMarkers(false);
  }

  const values = new Map<string, string>();
  for (const match of markdown.matchAll(markerPattern)) {
    collectMarkerAttributes(values, match.groups?.attributes);
  }

  return {
    trustedSource: true,
    authority: "audit-only",
    ...optionalState(values.get("state")),
    ...optionalTerminalState(values.get("terminal-state")),
    ...optionalNumber("epoch", values.get("epoch")),
    ...optionalString("lastReviewerReviewedSha", values.get("last-reviewer-reviewed-sha")),
    ...optionalString("lastFixerFixedSha", values.get("last-fixer-fixed-sha")),
    ...optionalNumber("fixAttempts", values.get("fix-attempts")),
    processedActionableIds: parseIdList(values.get("processed-actionable-ids")),
    processedBlockerIds: parseIdList(values.get("processed-blocker-ids")),
    ...optionalString("blockerHistory", values.get("blocker-history")),
    ...optionalString("lastFixerRunId", values.get("last-fixer-run-id"))
  };
}

function emptyMarkers(trustedSource: boolean): OrchestratorStateMarkers {
  return {
    trustedSource,
    authority: "audit-only",
    processedActionableIds: [],
    processedBlockerIds: []
  };
}

function collectMarkerAttributes(values: Map<string, string>, attributes: string | undefined): void {
  if (attributes === undefined) {
    return;
  }

  const matches = [...attributes.matchAll(keyPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match === undefined) {
      continue;
    }

    const key = match.groups?.key;
    if (match.index === undefined) {
      continue;
    }

    const valueStart = match.index + match[0].length;
    const nextMatch = matches[index + 1];
    const valueEnd = nextMatch?.index ?? attributes.length;
    const value = attributes.slice(valueStart, valueEnd).trim();

    if (key !== undefined && value.length > 0) {
      values.set(key, value);
    }
  }
}

function optionalState(value: string | undefined): Pick<OrchestratorStateMarkers, "state"> | Record<string, never> {
  if (isOrchestratorRuntimeState(value)) {
    return { state: value };
  }

  return {};
}

function optionalTerminalState(
  value: string | undefined
): Pick<OrchestratorStateMarkers, "terminalState"> | Record<string, never> {
  if (isOrchestratorTerminalState(value)) {
    return { terminalState: value };
  }

  return {};
}

function optionalNumber<Key extends "epoch" | "fixAttempts">(
  key: Key,
  value: string | undefined
): Pick<OrchestratorStateMarkers, Key> | Record<string, never> {
  if (value === undefined || !/^\d+$/u.test(value)) {
    return {};
  }

  return { [key]: Number(value) } as Pick<OrchestratorStateMarkers, Key>;
}

function optionalString<Key extends "lastReviewerReviewedSha" | "lastFixerFixedSha" | "blockerHistory" | "lastFixerRunId">(
  key: Key,
  value: string | undefined
): Pick<OrchestratorStateMarkers, Key> | Record<string, never> {
  if (value === undefined || value.length === 0) {
    return {};
  }

  return { [key]: value } as Pick<OrchestratorStateMarkers, Key>;
}

function parseIdList(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function isOrchestratorRuntimeState(value: string | undefined): value is OrchestratorRuntimeState {
  return (
    value === "REVIEWING" ||
    value === "FIXING" ||
    value === "VERIFYING" ||
    value === "CONVERGING" ||
    value === "CONVERGED_CLEAN" ||
    value === "STALLED_OSCILLATING" ||
    value === "CAPPED_WITH_OPEN" ||
    value === "HUMAN_REVIEW_REQUIRED"
  );
}

function isOrchestratorTerminalState(value: string | undefined): value is OrchestratorTerminalState {
  return value === "CONVERGED_CLEAN" || value === "STALLED_OSCILLATING" || value === "CAPPED_WITH_OPEN";
}

function isTrustedOrchestratorSource(source: OrchestratorStateMarkerSource): boolean {
  return source.trustedOrchestratorLogins.some((trustedLogin) =>
    trustedLogin.toLowerCase() === source.commentAuthorLogin.toLowerCase()
  );
}
