export type ActionableSeverity = "low" | "medium" | "high" | "critical";

export interface ActionableMarker {
  readonly id: string;
  readonly blockerId: string;
  readonly severity: ActionableSeverity;
  readonly category: string;
}

const actionableMarkerPattern = /<!--\s*ai-review:actionable(?<attributes>.*?)-->/gsu;
const attributePattern = /([A-Za-z][A-Za-z0-9_-]*)=("[^"]*"|'[^']*'|[^\s>]+)/gu;

export function extractActionableMarkers(markdown: string): readonly ActionableMarker[] {
  const markers: ActionableMarker[] = [];

  for (const markerMatch of markdown.matchAll(actionableMarkerPattern)) {
    const attributes = parseAttributes(markerMatch.groups?.attributes ?? "");
    const id = attributes.id;
    const blockerId = attributes.blocker;
    const severity = attributes.severity;
    const category = attributes.category;

    if (isNonEmpty(id) && isNonEmpty(blockerId) && isActionableSeverity(severity) && isNonEmpty(category)) {
      markers.push({ id, blockerId, severity, category });
    }
  }

  return markers;
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

function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isActionableSeverity(value: string | undefined): value is ActionableSeverity {
  return value === "low" || value === "medium" || value === "high" || value === "critical";
}
