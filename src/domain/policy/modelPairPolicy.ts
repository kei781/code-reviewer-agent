export interface ModelIdentity {
  readonly provider: string;
  readonly model: string;
  readonly family: string;
  readonly isFrontier: boolean;
}

export interface ModelPairPolicyInput {
  readonly reviewer: ModelIdentity;
  readonly fixer: ModelIdentity;
}

export type ModelPairBlockReason = "same-model" | "reviewer-not-frontier" | "fixer-not-frontier" | "same-model-family";
export type ModelPairWarning = "same-provider";

export interface ModelPairPolicyDecision {
  readonly allowed: boolean;
  readonly reasons: readonly ModelPairBlockReason[];
  readonly warnings: readonly ModelPairWarning[];
}

export function decideModelPairIndependence(input: ModelPairPolicyInput): ModelPairPolicyDecision {
  const reasons: ModelPairBlockReason[] = [];
  const warnings: ModelPairWarning[] = [];

  if (sameNormalized(input.reviewer.provider, input.fixer.provider) && sameNormalized(input.reviewer.model, input.fixer.model)) {
    reasons.push("same-model");
  }

  if (!input.reviewer.isFrontier) {
    reasons.push("reviewer-not-frontier");
  }

  if (!input.fixer.isFrontier) {
    reasons.push("fixer-not-frontier");
  }

  if (sameNormalized(input.reviewer.family, input.fixer.family)) {
    reasons.push("same-model-family");
  }

  if (sameNormalized(input.reviewer.provider, input.fixer.provider)) {
    warnings.push("same-provider");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    warnings
  };
}

function sameNormalized(left: string, right: string): boolean {
  return normalize(left) === normalize(right);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
