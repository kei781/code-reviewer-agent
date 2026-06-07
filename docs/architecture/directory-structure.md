# Directory Structure and Dependency Direction

The repository is intentionally split by responsibility so each module can be reused by future GitHub Actions, CLIs, local simulations, or alternative model adapters.

```text
.
├── ADR.md                         # Latest architecture decision record
├── PRD.md                         # Latest product requirements document
├── AGENTS.md                      # Binding instructions for future agents
├── docs/
│   ├── phase-plan.md              # Ordered PR-by-PR implementation plan
│   └── architecture/
│       └── directory-structure.md # This boundary document
├── src/
│   ├── domain/                    # Pure policies, types, state machines
│   ├── app/                       # Use cases and orchestration ports
│   ├── adapters/                  # GitHub/model/runtime implementations
│   ├── shared/                    # Generic utilities
│   └── project/                   # Repo-local phase and directory metadata
├── package.json
└── tsconfig.json
```

## v5 구성요소 (자체 호스팅 앵상블 리뷰 — 2026-06-04)

오케스트레이터가 GitHub Actions → **자체 호스팅 webhook 서버**로 바뀌었다(ADR/PRD §0). 어댑터 계층에 다음이 추가된다 (전부 adapter 계층 — domain/app 포트를 구현/호출):

- `src/adapters/HttpWebhookServer` — GitHub App webhook 수신 + HMAC 검증
- `src/adapters/GitHubAppAdapter` — Octokit + 설치토큰 발급 + 코멘트/인라인 게시 (서버측)
- `src/adapters/GitCliAdapter` — clone/checkout/pull (서버측, 읽기전용 작업공간 생성)
- `src/adapters/ContainerSandboxAdapter` — 격리 컨테이너 실행 (egress allowlist 강제, GitHub 토큰 미주입, PR 에이전트 설정 중화)
- `src/adapters/ClaudeCodeOrchestratorAdapter` — `OrchestratorPort` MVP 구현: 격리 세션에서 Reviewer 패스 spawn + 코드기반 교차검증 (교체 대상 — 추후 `ServerReconcileOrchestrator`)
- `src/adapters/ClaudeReviewerPassAdapter` / `CodexReviewerPassAdapter` — 각각 fresh-context 단일 모델 리뷰 → findings JSON
- `src/adapters/SqliteStateAdapter`, `SqliteQueueAdapter` — 제어 상태 · 경량 큐

app 계층에는 `RunEnsembleReview` 유스케이스와 `GitHubPort/GitWorkspacePort/OrchestratorPort/ReviewerPassPort/SandboxRunnerPort/StateStorePort/QueuePort`가 추가된다. 도메인 경계 규칙(아래)은 그대로다.

## Dependency rules

```text
src/project ─┐
src/shared ──┼── may be imported by any source module
src/domain ──┼── may import shared/project only when needed for static metadata
src/app ─────┼── may import domain/shared/project and injected ports
src/adapters ┘   may import app/domain/shared/project and concrete SDKs
```

Forbidden dependency directions:

- `src/domain` must not import `src/app` or `src/adapters`.
- `src/app` must not hard-code a concrete model provider or GitHub SDK implementation.
- `src/shared` must not contain project-specific PR review policy.
- Adapter code must not redefine domain policy; it should call domain/app modules.

## Why this matters

The ADR/PRD requires the system to stay vendor-neutral at the architecture layer while allowing concrete reviewer/fixer adapters. These boundaries keep the Reviewer R, Fixer F, Orchestrator, and Merge Gate independently testable and prevent a future agent from accidentally implementing a write-token model loop or formal-approval dependency before the approved phase.

**v5 노트**: 오케스트레이터는 이제 자체 호스팅 서버이고, 이번 빌드는 두 모델의 **앵상블 리뷰**(자동 수정·Merge Gate는 future scope)다. 핵심 불변식은 (1) 두 리뷰어의 독립성, (2) PR 코드와 자격증명의 **샌드박스 격리**, (3) GitHub 토큰을 샌드박스에 주입하지 않는 것이다. 도메인은 여전히 순수하게 유지하고, 서버·git·샌드박스·모델 호출은 전부 adapter 뒤에 둔다.
