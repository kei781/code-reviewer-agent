export type MergeSignal = 'PASS' | 'BLOCKED' | 'HUMAN_REVIEW_REQUIRED';

export interface ReviewSignal {
  readonly reviewedSha: string;
  readonly mergeSignal: MergeSignal;
  readonly blockers: readonly string[];
  readonly suggestions: readonly string[];
  readonly modelRole: 'reviewer';
}
