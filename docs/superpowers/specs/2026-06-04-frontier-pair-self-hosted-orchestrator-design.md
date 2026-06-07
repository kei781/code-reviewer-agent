# 설계 — Frontier Pair 자체 호스팅 앵상블 리뷰어

- **작성일**: 2026-06-04 (rev2 — 앵상블 리뷰로 피벗)
- **상태**: Design under review
- **관련 문서**: `ADR.md`, `PRD.md`, `AGENTS.md`, `docs/architecture/directory-structure.md`, `docs/phase-plan.md`
- **구현 저장소**: `kei781/code-reviewer-agent`
- **리뷰 대상**: repo 비종속 (설정으로 지정)

---

## 1. 목적과 north star

서로 다른 두 프론티어 모델(Claude, Codex)이 **각자 독립적으로** PR을 리뷰하고, 서로의 리뷰를 **교차검증**해, 합의된 유효한 지적만 PR의 해당 라인에 인라인으로 남긴다. 사람은 그 결과를 보고 **추가 개발 여부를 직접 결정**(resolve 또는 추가 수정 지시)한다.

기존 rev1 설계는 "R 리뷰 / F 자동수정 / blocker-0 수렴 루프"였다. 본 rev2는 **앵상블(교차) 리뷰**로 피벗한다: 자동 Fixer·수렴 루프를 제거하고, 수정은 사람이 결정한다. 오케스트레이션 지능은 서버의 TS 코드가 아니라 **격리된 Claude Code 에이전트 세션** 안에 둔다(Codex는 플러그인으로 연결). 서버는 thin하다.

R≠F 독립성, 보안(시크릿/PR 코드 격리), human-in-the-loop, 벤더 중립은 그대로 유지한다.

---

## 2. 확정된 결정

| 항목 | 결정 |
|---|---|
| 개념 모델 | **앵상블 리뷰** — 두 모델 독립 리뷰 → 교차검증 → 유효 findings만 게시 (자동 수정 없음) |
| 오케스트레이션 위치 | **격리된 Claude Code 에이전트 세션** 안 (Codex는 플러그인 연결). 서버는 thin |
| 서버 책임 | webhook 수신 · git clone/checkout · **격리 샌드박스에서 에이전트 실행** · 게시용 scoped 토큰 발급 · dedup/guard(결정론) |
| 코드 세팅 | diff API가 아니라 **풀 체크아웃**(clone+checkout+pull) — 에이전트가 레포 전체 문맥 확보 |
| 모델 | R=Claude, "F"=Codex (이번엔 둘 다 **리뷰어**로서 교차검증; 수정자 역할 아님) |
| 수정 | **사람이 결정**(6단계). 자동 autofix·수렴 루프 없음 |
| 상태 저장 | 하이브리드(소형) — SQLite=dedup/큐/멱등, PR 코멘트=사람용 결과 |
| GitHub 신원 | 자체 GitHub App 1개 |
| 알림 | GitHub 네이티브 |
| 스택 | 최소 — 단일 Node 프로세스 + SQLite + 경량 큐 + 컨테이너 격리 |

---

## 3. 사용자 흐름 (사용자 정의 6단계)

```text
0. 사전설정: Codex + Claude Code 설치, Claude Code에 Codex 플러그인 연결
1. GitHub의 특정 브랜치에 PR 생성
2. 그 이벤트를 자체 리뷰 서버로 webhook 전달 (HMAC 검증)
3. 서버가 격리 작업공간에 git clone → git checkout → git pull origin <branch> 로 코드베이스 세팅
4. 해당 브랜치에서 Claude Code 세션 실행 + 컨텍스트 전달:
   "Codex와 각자 독립적으로 이 PR을 리뷰한 뒤, 서로의 리뷰를 교차검증하고,
    유효한 리뷰만 게시하라"
5. 리뷰 완료 시 PR의 해당 코드 라인에 인라인 리뷰 게시 (+ 요약 1건)
6. 사람이 보고 추가 개발 여부 결정 → resolve 하거나 추가 수정 지시
```

---

## 4. ADR 개정안 (구현 전 ADR.md 반영 필요 — AGENTS.md 규칙 1·5·7)

기존 ADR/PRD는 "GHA 오케스트레이터 + R리뷰/F자동수정/수렴루프"를 못박았다. rev2는 다음을 변경한다.

- **D-amend-1 — 오케스트레이터**: GitHub Actions → **자체 호스팅 webhook 서버 + 격리 에이전트 세션**. 루프/판정 지능은 서버 TS가 아니라 에이전트 세션 안.
- **D-amend-2 — 파이프라인 모델**: "R리뷰 → F자동수정 → delta 재검증 → blocker-0 수렴" → **두 모델 독립 리뷰 → 교차검증 → 유효 findings 게시**. 자동 수정·수렴 루프 제거. 수정은 사람이 결정(human-in-the-loop 강화).
- **D-amend-3 — 코드 접근**: diff/marker 기반 → **PR 브랜치 풀 체크아웃**(격리 작업공간).
- **D-amend-4 — 상태**: marker-진실 → SQLite(dedup/큐/멱등) + PR 코멘트(사람용 결과).
- **D-amend-5 — 역할 재해석**: 이번 빌드에서 Codex는 "Fixer"가 아니라 **두 번째 독립 리뷰어**. (자동 Fixer 역할은 future scope로 이연 — §13)

### 유지되는 불변식
R≠F 및 동급 프론티어·model-family 독립성, **독립적 실패 모드 / 숨은 컨텍스트·trace 비공유**(§6.3 프로토콜로 강제), fork/risky-path/secret 보안, prompt injection 방어, human-in-the-loop(수정·merge는 사람), 벤더 중립 코어+어댑터, suggestion 비차단·실질 문제 집중.

### 문서 갱신
`directory-structure.md`에 server/webhook/sandbox/agent-runner/git 어댑터 반영(규칙 7).

---

## 5. 아키텍처 & 컴포넌트 분해

서버는 thin하고, "리뷰 지능"은 격리 에이전트 세션이 담당. 결정론적 안전장치만 서버 TS(domain/app)에 둔다.

```text
                    GitHub (App webhook)
                          │ pull_request[opened/synchronize/reopened/ready_for_review]
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│ 자체 서버 (단일 Node 프로세스, 사용자 도메인) — 시크릿 보유        │
│  [HttpWebhookServer] ─verify HMAC─▶ [QueuePort(SQLite)] ─2xx ack   │
│                                          │                         │
│                                          ▼                         │
│  [Worker] ─▶ [RunEnsembleReview (app)]                             │
│      1) Policy guard (same-repo/draft/fork/risky/SHA dedup)        │
│      2) GitWorkspace: clone+checkout+pull → 일회용 작업공간        │
│      3) 게시용 scoped 설치토큰 발급 (App key는 서버에만)           │
│      4) SandboxRunner: 격리 컨테이너에서 에이전트 세션 실행 ───────┼──┐
│      5) 결과 findings 수신 → dedup → 인라인+요약 게시(GitHubPort)  │  │
│  state: [StateStorePort(SQLite)]  (jobs, processed_events,        │  │
│         pr_review_state: last_reviewed_sha, posted finding keys)  │  │
└──────────────────────────────────────────────────────────────────┘  │
   App key(게시 토큰 발급)        ▼ (샌드박스: PR코드 + 모델토큰 + scoped 게시토큰만)
        │                  ┌─────────────────────────────────────────┐
        ▼                  │ 격리 컨테이너 (일회용, egress 제한)      │
   GitHub API              │  Claude Code 세션 (오케스트레이터)        │
   (인라인·요약·라벨)      │   ├─ 독립 리뷰 패스 A: Claude            │
                           │   ├─ 독립 리뷰 패스 B: Codex(plugin,      │
                           │   │     fresh context, A 미공유)          │
                           │   └─ 교차검증 → 유효 findings(JSON)        │
                           └─────────────────────────────────────────┘
```

### 5.1 레이어별 유닛

**domain (순수)**
- `ReviewFinding` — findings 스키마(파일·라인·심각도·근거·식별 fingerprint) + 파서/렌더러(인라인 코멘트·요약 marker)
- `Policy` — same-repo/draft/fork guard, risky path glob, 입력 한도, 모델-pair 독립성 설정 검증
- `Dedup` — 같은 SHA 재리뷰 방지, 같은 finding fingerprint 재게시 방지

**app (유스케이스)**
- `RunEnsembleReview` — guard → workspace 준비 → 토큰 발급 → 샌드박스 실행 → 결과 dedup·게시
- `RespondToMention` — @mention 시 read-only 후속 응답(선택)

**ports**
- `GitHubPort`(diff/labels 조회, 인라인 코멘트 upsert, 요약 코멘트, 라벨, 설치토큰 발급)
- `GitWorkspacePort`(clone/checkout/pull, 작업공간 생성·파기)
- `SandboxRunnerPort`(격리 컨테이너에서 에이전트 세션 실행; 입력=PR 메타+체크리스트+토큰, 출력=findings JSON)
- `StateStorePort`, `QueuePort`, `Clock/Logger`

**adapters**
- `GitHubAppAdapter`(Octokit + 설치토큰 발급 + webhook HMAC)
- `GitCliAdapter`(git clone/checkout/pull)
- `ContainerSandboxAdapter`(예: docker/ephemeral; 에이전트 세션 launch, egress allowlist)
- `ClaudeCodeAgentAdapter`(세션 프롬프트/플레이북 주입, Codex 플러그인 구성, findings JSON 회수)
- `SqliteStateAdapter`, `SqliteQueueAdapter`, `HttpWebhookServer`

**project**: repo별 설정(타깃 repo, safety checklist, risky paths, trigger alias, 모델 설정)

> "리뷰를 어떻게 하느냐"(프롬프트/플레이북)는 에이전트 세션에 위임. 서버 domain은 **guard·dedup·격리·게시**라는 결정론적 책임만 진다.

---

## 6. 흐름 상세 · 독립성 · 교차검증

### 6.1 트리거 → 잡
```text
pull_request[opened/synchronize/reopened/ready_for_review] → REVIEW 잡
issue_comment[@mention]  → INTERACTIVE 잡 (선택, read-only)
```
모든 잡은 동일한 `QueuePort`/`Worker` 인프라 공유. webhook은 즉시 2xx, 실제 리뷰는 비동기.

### 6.2 REVIEW 잡 처리
```text
guard(same-repo·non-draft·non-closed·SHA 미검토·입력한도) 통과?  (실패→skip+사유 코멘트)
  ▼
일회용 작업공간에 clone+checkout+pull (PR head)
  ▼
게시용 설치토큰 발급(scoped, 짧은 수명) — App private key는 샌드박스에 절대 미주입
  ▼
SandboxRunner: 격리 컨테이너에서 에이전트 세션 실행
  → 독립 리뷰 A(Claude) + 독립 리뷰 B(Codex) → 교차검증 → 유효 findings JSON
  ▼
findings dedup(이미 게시한 fingerprint 제외) → 인라인 코멘트(심각도 태그) + 요약 1건 게시
  ▼
last_reviewed_sha·posted finding keys 기록
```

### 6.3 독립성 프로토콜 (ADR D4 / AGENTS 규칙 4 준수)
- 패스 A(Claude)와 패스 B(Codex)는 **서로의 리뷰·추론 trace를 보지 못한다.** 각자 PR diff + 체크리스트만 입력으로 받아 독립 findings를 낸다(병렬 또는 순차, 단 교차 노출 없음).
- Codex는 fresh context(`codex exec` 류)에서 실행되어 Claude 세션의 transcript를 공유하지 않는다.
- **교차검증**은 A·B의 **findings 출력만** 받아 수행: 각 finding을 (양쪽 합의? 코드로 뒷받침? 중복? 오탐?) 기준으로 판정해 유효한 것만 통과.
- ⚠️ **잔여 편향 트레이드오프(오픈)**: 교차검증/오케스트레이션을 Claude 세션이 겸하면 Claude가 자기 findings를 편애할 수 있음. 완화: A의 findings를 **B 호출 전에 확정(commit)**하고, 교차검증은 각 채택/기각을 코드 근거로 정당화하게 강제. 더 엄격히 하려면 교차검증을 중립 패스로 분리(서버가 A·B를 각각 독립 실행) — §12.

### 6.4 출력 규칙
- 구체 지적 = 해당 라인 인라인 코멘트(`[P0]/[P1]/[P2]` 등 심각도 태그, 가능하면 수정 제안).
- 전반 요약 = 코멘트 1건(어떤 항목을 양쪽이 합의했는지 포함).
- 리뷰 텍스트를 일반 출력 말고 GitHub 코멘트로만 게시. 단순 칭찬 최소화.
- synchronize 재리뷰 시 이미 게시한 finding은 fingerprint로 dedup(중복 코멘트 방지).

---

## 7. 상태 저장 (소형 하이브리드)

SQLite = 운영 제어, PR 코멘트 = 사람용 결과.

```text
jobs             PK(id) · UNIQUE(dedupe_key)   ← 경량 큐
  type(REVIEW|INTERACTIVE), repo, pr_number, payload, status, attempts,
  available_at, locked_at, created_at
processed_events PK(delivery_id)               ← webhook 멱등
pr_review_state  PK(repo, pr_number)
  last_reviewed_sha, posted_finding_keys(json), updated_at  ← SHA·finding dedup
```
- 재시작: jobs 영속 + locked_at lease 만료 시 재큐.
- rev1의 blockers/actionables/convergence/epoch 테이블은 **제거**(앵상블 모델엔 불필요).

---

## 8. 보안 & 격리 (rev2 핵심)

> 서버가 PR 브랜치 코드를 받아 에이전트가 다루는데 서버엔 자격증명이 있다. 이는 직전 PR #3에서 고친 취약점의 아키텍처 버전이므로 **격리가 1순위**다.

- **샌드박스 실행**: 에이전트 세션은 일회용 컨테이너에서 실행. PR 코드 실행 위험을 호스트/시크릿과 분리.
- **App private key 미노출**: private key는 **서버(샌드박스 밖)** 에만. 서버가 해당 repo·PR 코멘트로만 scoped된 **짧은 수명 설치토큰**을 발급해 샌드박스에 전달. 만료/회수.
- **PR 코드 실행 최소화**: 기본 리뷰는 코드 "읽기/탐색"(checkout는 문맥용). 빌드/설치/테스트 등 **PR 통제 코드 실행은 기본 금지**. 실행이 꼭 필요하면 egress 차단된 격리에서만.
- **Egress allowlist**: 샌드박스 네트워크는 필요한 곳(api.anthropic.com / openai / api.github.com 등)만. 그 외 차단 → 자격증명 exfil 방지.
- **모델 토큰 노출 최소화**: 모델 호출용 토큰은 샌드박스에 필요. egress 제한 + PR 코드 비실행으로 탈취면을 줄인다.
- **fork PR**: 시크릿/write 금지(읽기 전용 리뷰만 선택). risky path(`.github/workflows/**`, `auth/**`, `secrets/**`, `*.pem`, `.env*`): `security-sensitive` + 자동 처리 제한.
- **prompt injection**: PR 내용·코드·코멘트는 untrusted. 워크플로 지시와 충돌하는 repo 지시 무시. secret 노출/권한 변경/merge 금지. 불확실하면 HUMAN_REVIEW_REQUIRED.
- **Ingress**: webhook HMAC(`X-Hub-Signature-256`) 검증 + HTTPS(Caddy/Cloudflare) + delivery_id 멱등.
- **secret 보관**: App key·모델 토큰·webhook secret은 서버 환경(.env, 600). repo 커밋·로그·코멘트 출력 금지.

---

## 9. 에러 처리 & 관측

- 잡 재시도(지수 백오프, attempts 초과 시 failed). 실패·skip은 silent 금지 → 구조화 로그 + PR 코멘트 사유.
- 에이전트 세션 타임아웃(max runtime) + stdout/stderr 캡처. findings JSON 파싱 실패 시 실패 처리 + 사유.
- 작업공간/컨테이너는 잡 종료 시 항상 파기(크래시 시 orphan 정리).
- 입력 한도(max_changed_files/max_diff_lines) 초과 시 skip+사유.
- 구조화 로그: trigger, PR#, head SHA, actor, 모델, model-independence, skip reason, labels, risky files, posted/deduped finding 수, terminal 결과. 토큰/키 레닥션.

---

## 10. 테스트 전략

- **domain (순수, TDD)**: ReviewFinding 파서/렌더러 round-trip, Policy guard(glob·fork·한도), Dedup(SHA·fingerprint).
- **app (fake 포트)**: `RunEnsembleReview`를 fake GitWorkspace/SandboxRunner/GitHub로 — guard 통과/실패, dedup, 게시 호출, skip 경로를 결정론 검증. (SandboxRunner는 캔드 findings JSON 반환 fake)
- **adapters (얇은 통합)**: HMAC, SQLite, GitCli(임시 repo), ContainerSandbox(스텁 명령), GitHubAppAdapter(녹화 fixture).
- **에이전트 리뷰 품질**: 단위 테스트 대상 아님(프롬프트/모델 의존) → 소수의 **골든 PR 픽스처로 eval/통합**(합의·오탐 비율 관찰). 결정론 보장은 서버 경계까지.
- 테스트 러너: `node --test "dist/**/*.test.js"`(no-op 회피).

---

## 11. 구현 단계 (writing-plans에서 상세화)

**P0a — 단일 모델 리뷰 (서버 기반 골격)**
0. **(독립 첫 PR, 코딩 전)** ADR.md에 §4 개정안 반영 + directory-structure 갱신.
1. HttpWebhookServer + HMAC + processed_events
2. SqliteQueue + Worker + lease 복구
3. GitHubAppAdapter(설치토큰 발급, diff/labels, 인라인 코멘트 upsert, 요약)
4. GitCliAdapter(clone/checkout/pull) + 일회용 작업공간
5. ContainerSandboxAdapter(격리 실행, egress allowlist, App key 미주입) + 토큰 주입
6. ClaudeCodeAgentAdapter(Claude 단독 리뷰 → findings JSON)
7. ReviewFinding 스키마/파서/렌더러 + Policy guard(same-repo/draft/fork/risky/한도) + Dedup(SHA·fingerprint)
8. RunEnsembleReview(단일 모델 버전) + pr_review_state
9. 실패/스킵 코멘트 + 구조화 로그

**P0b — Codex 추가 + 교차검증 (앵상블 완성)**
1. Codex 플러그인 연결(fresh context 실행 보장)
2. 독립 리뷰 A/B 프로토콜(§6.3) + 교차검증 단계
3. 유효 findings만 게시 + 합의 표기 요약

**향후(future scope)**: 사람이 트리거하는 옵트인 자동 수정(rev1의 Fixer/apply/수렴), P2 verdict check·auto-merge — ADR 로드맵대로.

---

## 12. 오픈 이슈

- **교차검증 중립성**: Claude가 리뷰어 겸 교차검증자면 잔여 편향(§6.3). 중립 패스 분리(서버가 A·B 독립 실행 후 별도 reconcile) vs 에이전트 내 처리 — 운영 후 결정.
- **Codex 플러그인 연결 방식**: Claude Code에 Codex를 MCP/서브에이전트/CLI 중 무엇으로 붙일지, fresh-context 보장 방법.
- **PR 코드 비실행 vs 실행**: 실행 기반 검증(테스트 등)이 필요한 리뷰는 격리 강도를 더 올려야 함.
- finding fingerprint 안정성(코드 이동 시 라인 추적), synchronize 간 dedup.
- 샌드박스 egress allowlist 구체 목록, 컨테이너 베이스 이미지.
- 에이전트 세션 동시성 상한(경량 큐 worker 수).

---

## 13. 비목표 (이 빌드)

자동 Fixer/패치 apply/수렴 루프(future), P2 `ai-review/verdict`·`ai-automerge`, multi-repo 고급 스케일링, 외부 알림(Slack/이메일), GraphQL thread resolve. ADR/PRD 로드맵대로 후속.
