# InsightFlow ownership and handoff

The original INSIGHTFLOW_MASTER_BLUEPRINT.md is the product specification. This file is the single source of truth for ownership. Phase 1 scope is the frozen contracts and a verified read-only foundation.

| Area | Owner |
| --- | --- |
| src/app/api, src/lib/contracts, src/lib/analysis, src/lib/db, src/lib/fixtures | Codex |
| src/proxy.ts (API auth cookie refresh) | Codex |
| src/app/api/auth, src/lib/contracts/auth.ts (additive auth protocol) | Codex |
| scripts, supabase/migrations, tests, baseline docs | Codex |
| src/app/(app) screens, src/components, public | Antigravity after Phase 1 handoff |
| package.json, package-lock.json, build/lint/test configuration, .env.example, .gitignore | Codex; coordinate dependency requests |
| src/app/layout.tsx, src/app/globals.css | Antigravity after handoff; coordinate server/config changes with Codex |
| docs/API_CONTRACT.md, docs/api-examples.json | Codex frozen v1; coordinated version changes only |

Codex creates the minimal UI shell before handoff. After handoff, Codex must not edit frontend-owned sources. Antigravity reads the blueprint, this file, architecture docs, contract docs and examples first. No two agents write the same file concurrently; no cross-owner formatting sweeps. Ask the file owner for changes and include the reason. Breaking contracts require a version bump, regenerated examples, tests and explicit handoff coordination.

Do not spend Adaption credits, fabricate runs/annotations/metrics, expose secrets, or make shared demo data writable. Keep fixtures labeled. Missing complaint dates/customer IDs remain unavailable. Preserve raw rows and batch-scoped exact text groups. A passed test is not proof that an unapplied Supabase migration works in production.

Required checks: npm run lint, npm run typecheck, npm test, npm run build, npm run smoke (against a running app). Official assertions run only against data/raw/customer_feedback.csv. Do not invent the official dataset.

Phase 3 authorization: the user's integration request explicitly permits Codex to repair confirmed frontend defects with minimal scoped changes while preserving the design. This exception applies to this integration audit only; frontend ownership otherwise remains with Antigravity. Both isolated Phase 2 worktrees remain untouched. Frozen contracts stay at v1.0.0.

Phase 4: infrastructure/server/offline pilot preparation only, no frontend-owned edits or remote operations. New auth protocol is separate from frozen domain v1.0.0; Antigravity follows docs/AUTH_UI_HANDOFF.md. Upload, quote, paid execution, download and remote deployment/migration each require separate explicit authorization; command flags alone do not grant it. Do not overwrite gold labels or provider attempt ledgers. Human-approved adapted completions are training examples, not independent classification truth.

Phase 5B authorization: the user explicitly permits Codex to integrate Phase 5A, repair authentication/session/cache defects and connect its existing selector to owner-scoped batch discovery. Minimal frontend edits and reproducible browser tests are authorized for this phase; design ownership remains Antigravity. All existing worktrees stay intact. Batch discovery is additive batches-1.0.0; frozen domain v1.0.0 is unchanged. No remote setup, migrations, deployment, transfer or provider calls are authorized.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
