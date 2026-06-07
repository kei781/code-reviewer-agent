import { reviewSummaryMarker } from "../review/reviewMarker.js";

export type ActionableSeverity = "low" | "medium" | "high" | "critical";

export interface ActionableMarker {
  readonly id: string;
  readonly blockerId: string;
  readonly severity: ActionableSeverity;
  readonly category: string;
}

export interface ActionableMarkerSource {
  readonly markdown: string;
  readonly authorLogin: string;
  readonly trustedReviewerLogins: readonly string[];
}

const actionableMarkerPattern = /<!--\s*ai-review:actionable(?:\s+(?<attributes>.*?))?\s*-->/gsu;
const attributePattern = /([A-Za-z][A-Za-z0-9_-]*)=("[^"]*"|'[^']*'|[^\s>]+)/gu;

export function extractActionableMarkers(source: ActionableMarkerSource): readonly ActionableMarker[] {
  if (!isTrustedReviewerSummary(source)) {
    return [];
  }

  const markers: ActionableMarker[] = [];
  const seenIds = new Set<string>();

  for (const markerMatch of source.markdown.matchAll(actionableMarkerPattern)) {
    const attributes = parseAttributes(markerMatch.groups?.attributes ?? "");
    const id = normalizeAttribute(attributes.id);
    const blockerId = normalizeAttribute(attributes.blocker);
    const severity = normalizeAttribute(attributes.severity);
    const category = normalizeAttribute(attributes.category);

    if (isNonEmpty(id) && isNonEmpty(blockerId) && isActionableSeverity(severity) && isNonEmpty(category) && !seenIds.has(id)) {
      markers.push({ id, blockerId, severity, category });
      seenIds.add(id);
    }
  }

  return markers;
}

function isTrustedReviewerSummary(source: ActionableMarkerSource): boolean {
  return source.markdown.includes(reviewSummaryMarker) && source.trustedReviewerLogins.map(normalizeLogin).includes(normalizeLogin(source.authorLogin));
}

function parseAttributes(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const attributeMatch of value.matchAll(attributePattern)) {
    const key = attributeMatch[1];
    const rawValue = attributeMatch[2];

    if (key === undefined || rawValue === undefined) {
      continue;
    }

    attributes[key] = stripQuotes(rawValue);
  }

  return attributes;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeAttribute(value: string | undefined): string | undefined {
  return value?.trim();
}

function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isActionableSeverity(value: string | undefined): value is ActionableSeverity {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
