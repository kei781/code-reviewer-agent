export type PhaseId = 'P0';

export type PhaseStatus = 'planned' | 'in-progress' | 'blocked' | 'complete';

export interface PhaseDefinition {
  readonly id: PhaseId;
  readonly title: string;
  readonly goal: string;
  readonly entryCriteria: readonly string[];
  readonly exitCriteria: readonly string[];
  readonly ownsDirectories: readonly string[];
  readonly status: PhaseStatus;
}
