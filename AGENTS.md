# Agent Operating Principles

This repository implements the ADR/PRD-defined Frontier Pair AI PR review, autofix, verification, and convergence pipeline.

## Non-negotiable architecture rules

1. Read the latest root `ADR.md` and `PRD.md` before changing implementation code.
2. Keep Reviewer (R), Fixer (F), Orchestrator, policy, and adapter concerns separated.
3. Do not couple reusable domain rules to a specific model vendor, GitHub Action, or CLI. Vendor/tool details belong in adapters.
4. R and F must remain independently configurable and must not share hidden execution context or self-review traces.
5. Never add auto-merge, write-token fixer behavior, fork-PR secret access, or branch-protection bypasses without the phase that explicitly allows them.
6. Prefer small, reusable TypeScript modules with explicit exported types over inline scripts.
7. If a phase changes directory ownership or boundaries, update `docs/architecture/directory-structure.md` in the same PR.

## v5 운영 노트 (2026-06-04 — 자체 호스팅 앵상블 리뷰)

ADR/PRD §0 개정에 따른 v5 적용 사항. (상세: `docs/superpowers/specs/2026-06-04-frontier-pair-self-hosted-orchestrator-design.md`)

- **오케스트레이터**: GitHub Actions → **자체 호스팅 webhook 서버 + 격리 에이전트 세션**. 이번 빌드는 두 모델 **앵상블 리뷰**(자동 수정·Merge Gate는 future). 규칙 5(auto-merge/write-token/branch-protection 우회 금지)는 그대로 — 이번 빌드는 그 phase가 아니다.
- **규칙 4 적용 방식**: Reviewer-A(Claude)·Reviewer-B(Codex)는 `OrchestratorPort`가 **각각 fresh-context 패스로 spawn**한다. 두 패스는 trace를 공유하지 않으므로 **규칙 4(생성 단계 독립성)는 유지**된다.
- **규칙 4 — 명시된 예외(의도된 MVP 절충)**: MVP의 `OrchestratorPort` 구현이 **Claude Code**라, 같은 오케스트레이터가 교차검증(판정)을 겸한다 → **판정 단계에 한해** 잔여편향이 있다. 이는 포트 뒤 어댑터 교체(`ServerReconcileOrchestrator`, 중립 reconcile)로 해소 가능한 사안으로 기록한다. 생성 단계의 trace 비공유는 깨지 않는다.
  - **추적**: 이 예외의 단일 기록처는 본 노트 + spec §6.3/§12다. 운영 지표(A/B 합의율·판정 기각률)로 영향을 관찰하고, 중립 오케스트레이터로 교체되면 본 예외를 해제·삭제한다. "이연"이 "영구 허용"이 되지 않도록 교체 시점/승인 기준은 §12 오픈으로 둔다.
- **보안 불변식(신규)**: PR 통제 코드·에이전트 설정(`.claude/`, `CLAUDE.md`, git hooks 등) 미실행/중화, **GitHub 토큰·App key는 샌드박스에 미주입**(fetch·게시 서버측), egress=모델 API만.

## Directory ownership rules

- `src/domain`: pure reusable business rules, policies, state machines, and typed contracts. No process env, filesystem, network, GitHub SDK, model SDK, or shell execution.
- `src/app`: orchestration use cases that coordinate domain rules and ports. May depend on `src/domain` and `src/shared`, but not concrete adapters directly unless injected through ports.
- `src/adapters`: concrete integrations for GitHub, model providers, file artifacts, command execution, and CI/runtime surfaces. May implement ports declared by app/domain modules.
- `src/shared`: generic utilities that are not project-policy specific. Avoid dumping business logic here.
- `src/project`: repository-local constants, phase planning metadata, and human-readable implementation maps derived from the root ADR/PRD.
- `docs`: implementation plans, architecture notes, and operational runbooks.

## Testing and validation expectations

- Run `npm run check` after TypeScript changes whenever dependencies are available.
- Add or update tests for reusable rules, policy decisions, state transitions, and parsing logic.
- Keep generated output such as `dist/` out of source control unless a future phase explicitly requires checked-in build artifacts.
