# v0.2 Evidence Foundation Verification Record

Date: 2026-09-22  
Execution: Native execution on the current checkout  
Branch: codex/v0.2-evidence-foundation

## Scope

This record covers the v0.2 Evidence Foundation implementation in the current
checkout:

- Evidence Domain types, invariants, diagnostics, and YAML File Contract.
- Content-addressed artifacts with size/checksum/path/orphan verification.
- Offline JUnit, Playwright JSON, and Pytest JSON adapters.
- Import/Verify application services with unverified provenance, idempotency,
  stale-revision protection, and atomic manifest writes.
- qaw evidence import, qaw evidence verify, and the v0.1-compatible
  validate/doctor Evidence checks.
- Domain and adapter architecture boundary assertions.

The CLI does not assign trusted status or calculate a Quality Score.

## Verification status

| Area | Status | Evidence |
| --- | --- | --- |
| Local format check | PASS | pnpm format:check |
| Local lint | PASS | pnpm lint |
| Local typecheck | PASS | pnpm typecheck |
| Package build | PASS | pnpm build, 11/11 workspace builds |
| Unit tests | PASS | included in pnpm test, 264 tests total |
| Contract tests | PASS | included in pnpm test, 29 test files total |
| Integration tests | PASS | included in pnpm test, including CLI/Evidence paths |
| Architecture checks | PASS | pnpm check:architecture, 4 files / 5 tests |
| Documentation checks | PASS | pnpm check:docs |
| Golden Path browser E2E | PASS | pnpm test:e2e, 1 test |
| External CI | NOT_RUN | No remote CI run was requested or claimed |
| GitHub tag/Release | NOT_RUN | No tag or Release was created |
| Registry publication | NOT_RUN | No package publication was attempted |
| Production deployment | NOT_RUN | No deployment was attempted |
| Browser/runtime model evaluation | NOT_RUN | Golden Path used the deterministic local path |
| Business acceptance | NOT_RUN | Requires explicit product acceptance |

## Targeted regression commands

- pnpm exec vitest run tests/unit/domain/evidence-domain.test.ts tests/contract/evidence-file.contract.test.ts tests/unit/evidence/adapters.test.ts
  3 files / 34 tests passed.
- pnpm exec vitest run tests/integration/evidence-store.test.ts tests/integration/evidence-import.test.ts tests/integration/evidence-verify.test.ts tests/integration/cli-evidence.test.ts
  4 files / 30 tests passed, including the temporary staging symlink rejection.
- pnpm exec vitest run tests/integration/cli.test.ts tests/integration/quality-store.test.ts tests/integration/runtime-store.test.ts tests/integration/server.test.ts
  4 files / 18 tests passed.
- git diff --check
  Required final whitespace check.

## Delivery boundary

The implementation is locally verified only. Remote GitHub objects, external
CI, package registries, production systems, model-runtime evaluation, and
business acceptance remain unclaimed and require separate evidence.

Implementation commits:

- 1c2b66c — feat: add evidence domain contract
- 7f6926f — feat: add evidence file contract and store
- c355fb1 — feat: add evidence import adapters
- 08827a5 — feat: add evidence import and integrity services
- 7d5c32c — feat: add evidence cli commands
- 46612e8 — fix: reject symlinked evidence staging directory
