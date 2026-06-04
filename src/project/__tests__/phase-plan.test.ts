import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { directoryRules, getFirstBlockedPhase, implementationPhases } from "../../index.js";

describe("implementation phase plan", () => {
  it("keeps phase identifiers unique and ordered", () => {
    const ids = implementationPhases.map((phase) => phase.id);

    assert.deepEqual(ids, ["phase-0", "phase-1", "phase-2", "phase-3", "phase-4", "phase-5", "phase-6"]);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("marks phase 0 as the current implementation phase", () => {
    const currentPhase = implementationPhases.find((phase) => phase.id === "phase-0");

    assert.equal(currentPhase?.status, "implementing");
  });

  it("blocks the first future phase until phase 0 PR comments are resolved", () => {
    const firstBlockedPhase = getFirstBlockedPhase();

    assert.equal(firstBlockedPhase?.id, "phase-1");
  });
});

describe("directory rules", () => {
  it("documents the reusable module boundaries that future agents must preserve", () => {
    const domainRule = directoryRules.find((rule) => rule.path === "src/domain");
    const adapterRule = directoryRules.find((rule) => rule.path === "src/adapters");

    assert.ok(domainRule);
    assert.ok(domainRule.mustNotContain.includes("GitHub SDK calls"));
    assert.ok(adapterRule);
    assert.ok(adapterRule.mustNotContain.includes("R/F role conflation"));
  });
});
