const requiredRiskyPathPatterns = [
  '.github/workflows/**',
  '.github/actions/**',
  'scripts/deploy/**',
  'infra/**',
  'terraform/**',
  'k8s/**',
  'helm/**',
  'migrations/**',
  'db/migrations/**',
  'auth/**',
  'billing/**',
  'security/**',
  'secrets/**',
  '*.pem',
  '*.key',
  '*.crt',
  '.env',
  '.env.*'
] as const;

const optionalRiskyPathPatterns = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'go.sum'] as const;

export type RiskyPathSeverity = 'required' | 'optional';

export interface RiskyPathMatch {
  readonly path: string;
  readonly pattern: string;
  readonly severity: RiskyPathSeverity;
}

export interface RiskyPathDecision {
  readonly hasRequiredRisk: boolean;
  readonly hasOptionalRisk: boolean;
  readonly matches: readonly RiskyPathMatch[];
}

export const riskyPathPatterns = {
  required: requiredRiskyPathPatterns,
  optional: optionalRiskyPathPatterns
} as const;

export function evaluateRiskyPaths(paths: readonly string[]): RiskyPathDecision {
  const matches = paths.flatMap((path) => {
    const required = requiredRiskyPathPatterns
      .filter((pattern) => matchesPathPattern(path, pattern))
      .map((pattern) => ({ path, pattern, severity: 'required' as const }));
    const optional = optionalRiskyPathPatterns
      .filter((pattern) => matchesPathPattern(path, pattern))
      .map((pattern) => ({ path, pattern, severity: 'optional' as const }));

    return [...required, ...optional];
  });

  return {
    hasRequiredRisk: matches.some((match) => match.severity === 'required'),
    hasOptionalRisk: matches.some((match) => match.severity === 'optional'),
    matches
  };
}

function matchesPathPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }

  if (pattern.includes('*')) {
    const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
    return regex.test(path);
  }

  return path === pattern;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}
