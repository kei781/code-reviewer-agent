# Implementation Phase Plan

This plan is derived from the latest root `ADR.md` and `PRD.md`. Each phase must be implemented in its own pull request. The next phase may start only after all review comments on the previous phase PR are resolved.

> **v5 개정 (2026-06-04)**: 오케스트레이터가 **자체 호스팅 서버 + 앵상블 리뷰**로 전환됨 (ADR/PRD §0, 상세: `docs/superpowers/specs/2026-06-04-frontier-pair-self-hosted-orchestrator-design.md`). 아래 **Phase 1~6**(GitHub Actions 기반 R리뷰/F자동수정/수렴)은 **superseded — 역사적 맥락으로 보존**한다. 새 구현은 아래 **v5 단계**를 따른다.

## v5 단계 (자체 호스팅 앵상블 리뷰)

### v5-P0 — Governance (선행, 코딩 전)
ADR.md/PRD.md §0 개정(완료), `directory-structure.md`·`phase-plan.md` 갱신. 코드 작성은 이 PR 머지 후 시작.

### v5-P0a — 단일 모델 리뷰 (서버 골격)
webhook(HMAC)+SQLite 큐+워커 · GitHubAppAdapter(설치토큰·diff/labels·인라인 게시) · GitCli(clone/checkout/pull, 읽기전용 작업공간) · ContainerSandbox(격리·egress allowlist·GitHub토큰 미주입) · ClaudeCodeAgent(단독 리뷰→findings JSON) · ReviewFinding 스키마/파서 · Policy guard(same-repo/draft/fork/risky/한도) · Dedup(SHA·fingerprint) · RunEnsembleReview(단일) · 실패/스킵 코멘트+구조화 로그.

### v5-P0b — Codex 추가 + 교차검증 (앵상블 완성)
Codex 플러그인(fresh context) · A/B 독립 리뷰 프로토콜 · **코드베이스 기반** 교차검증 · 유효 finding만 게시.

### v5-future
사람 트리거 옵트인 자동수정(구 Fixer/apply/수렴), P2 verdict check·auto-merge.

---

## (superseded, v4) Phase 0 — Repository structure and agent guardrails

**Goal:** Establish a human-readable TypeScript project layout and write durable rules so future agents do not collapse role boundaries or mix adapter concerns into reusable modules.

**Deliverables:**

- TypeScript package baseline with strict compiler settings.
- `src` directory split into domain, app, adapter, shared, and project areas.
- Architecture documentation for directory boundaries and dependency direction.
- Root `AGENTS.md` rules that bind future agents to the ADR/PRD phase model.
- Phase metadata module and tests proving the plan is explicit and ordered.

**Exit criteria:**

- `npm run check` succeeds.
- Phase plan documents that implementation stops after this PR until comments are resolved.

## Phase 1 — P0 Reviewer Signal MVP

**Goal:** Implement the structured reviewer signal path for same-repo PRs without formal approval, autofix, or merge automation.

**Deliverables:**

- PR event policy and same-repo guard.
- Structured review comment schema with `MERGE_SIGNAL` and hidden markers.
- Reviewer prompt contract emphasizing SQL safety, catalog allowlist, LIMIT handling, LLM-to-query paths, and test gaps.
- Adapter ports and one concrete reviewer adapter wiring path.
- Tests for policy decisions and comment rendering.

## Phase 2 — P0 follow-up reviewer interactions

**Goal:** Support explicit reviewer mention/command follow-up without turning comments into implicit approvals.

**Deliverables:**

- Mention/command parser.
- Follow-up response schema.
- SHA-aware dedupe and stale review handling.
- Tests for trigger parsing and safe no-op behavior.

## Phase 3 — P1 Frontier Pair Autofix Pilot

**Goal:** Add opt-in `ai-autofix` handling where Fixer F proposes bounded patches and a separate apply job owns write permissions.

**Deliverables:**

- Actionable blocker marker schema.
- Fixer analyze contract that emits patch artifacts and summaries.
- Apply-job policy gates for labels, attempts, SHA, risky paths, same-repo source, and R/F independence.
- Commit metadata and PR comment audit trail.

## Phase 4 — P1 Delta verification and convergence state

**Goal:** Re-run Reviewer R against fixer deltas and mark blocker-fixpoint convergence only when unresolved blockers are zero on the latest SHA.

**Deliverables:**

- State machine for reviewing, fixing, verifying, converged, stalled, and capped states.
- Hidden marker parser/updater for epoch, attempts, processed blockers, and histories.
- Round caps and oscillation handling.
- Tests for state transitions and convergence criteria.

## Phase 5 — P2-H Conservative Merge Gate

**Goal:** Add CI/branch-protection-compatible verdict checks while keeping human final review.

**Deliverables:**

- `ai-review/verdict` check abstraction.
- Required-check compatible status outcomes.
- `ai-automerge` policy that only enables GitHub native auto-merge after all gates and human requirements are satisfied.
- No direct merge implementation.

## Phase 6 — P2-A and P3 advanced operations

**Goal:** Add explicitly approved low-risk autonomous mode and operational improvements only after a separate policy amendment.

**Deliverables:**

- Low-risk path policy and trusted-author policy.
- Optional thread resolve/reporting/alerts/cost controls.
- Rollback or recovery runbooks.
