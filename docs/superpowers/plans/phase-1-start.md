# Phase 1 Start: Review-server Cross-validation MVP

## Branch

`codex/phase1-review-server-cross-validation`

## Goal

Implement the webhook-driven P0 review-server cross-validation MVP described by `ADR.md`, `PRD.md`, and `docs/IMPLEMENTATION_PHASES.md`.

## Initial Scope

- Implement webhook intake behind an app port.
- Validate repository URL, pull request number, base branch, head branch, and head SHA.
- Prepare a local workspace pinned to the webhook head SHA through an adapter.
- Spawn independent Claude Code and Codex reviewer passes with fresh context.
- Cross-validate candidate findings against local files and PR diff before posting.
- Publish only validated findings and summary markers.

## Guardrails

- Keep P0 review-only.
- Do not add code modification, formal approval, thread resolution, merge automation, branch-protection bypass, or write-token model behavior.
- Keep domain rules pure and adapter details behind ports.
