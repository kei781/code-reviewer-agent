export type MergeSignal = 'PASS' | 'BLOCKED' | 'NEEDS_HUMAN_REVIEW';

export interface ReviewSignal {
  readonly reviewedSha: string;
  readonly mergeSignal: MergeSignal;
  readonly blockers: readonly string[];
  readonly suggestions: readonly string[];
  readonly modelRole: 'reviewer';
}
