export type OrchestratorRuntimeState =
  | "REVIEWING"
  | "FIXING"
  | "VERIFYING"
  | "CONVERGING"
  | "CONVERGED_CLEAN"
  | "STALLED_OSCILLATING"
  | "CAPPED_WITH_OPEN"
  | "HUMAN_REVIEW_REQUIRED";

export interface OrchestratorStateMarkers {
  readonly state?: OrchestratorRuntimeState;
  readonly epoch?: number;
  readonly lastReviewerReviewedSha?: string;
  readonly lastFixerFixedSha?: string;
  readonly fixAttempts?: number;
  readonly processedActionableIds: readonly string[];
  readonly processedBlockerIds: readonly string[];
  readonly blockerHistory?: string;
  readonly lastFixerRunId?: string;
}

const markerPattern = /<!--\s*ai-orchestrator:(?<key>[a-z-]+)=(?<value>.*?)\s*-->/gsu;

export function parseOrchestratorStateMarkers(markdown: string): OrchestratorStateMarkers {
  const values = new Map<string, string>();

  for (const match of markdown.matchAll(markerPattern)) {
    const key = match.groups?.key;
    const value = match.groups?.value?.trim();

    if (key !== undefined && value !== undefined) {
      values.set(key, value);
    }
  }

  return {
    ...optionalState(values.get("state")),
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

function optionalState(value: string | undefined): Pick<OrchestratorStateMarkers, "state"> | Record<string, never> {
  if (isOrchestratorRuntimeState(value)) {
    return { state: value };
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
