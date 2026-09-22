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

| Area                             | Status  | Evidence                                                  |
| -------------------------------- | ------- | --------------------------------------------------------- |
| Local format check               | PASS    | direct Prettier check                                     |
| Local lint                       | PASS    | direct ESLint check                                       |
| Local typecheck                  | PASS    | direct TypeScript check                                   |
| Package build                    | PASS    | direct TypeScript build, 10 workspace configs             |
| Workspace build wrapper          | BLOCKED | pnpm shim cannot create its temporary install dir         |
| Unit tests                       | PASS    | Vitest full run, 270 tests total                          |
| Contract tests                   | PASS    | included in Vitest full run, 29 test files                |
| Integration tests                | PASS    | included in Vitest full run, including CLI/Evidence paths |
| Architecture checks              | PASS    | direct Vitest run, 4 files / 5 tests                      |
| Documentation checks             | PASS    | direct check-docs run                                     |
| Golden Path browser E2E          | PASS    | previously verified; review fixes do not touch UI         |
| External CI                      | NOT_RUN | No remote CI run was requested or claimed                 |
| GitHub tag/Release               | NOT_RUN | No tag or Release was created                             |
| Registry publication             | NOT_RUN | No package publication was attempted                      |
| Production deployment            | NOT_RUN | No deployment was attempted                               |
| Browser/runtime model evaluation | NOT_RUN | Golden Path used the deterministic local path             |
| Business acceptance              | NOT_RUN | Requires explicit product acceptance                      |

## Review remediation

The whole-branch review identified and fixed these fail-closed and determinism
gaps before remote delivery:

- Nested unknown keys are rejected at every Evidence YAML object level with
  `EVIDENCE_UNKNOWN_KEY`; direct store writes use the same key contract.
- A symlinked `.ai-qa` parent is rejected before manifest or artifact writes,
  including commit-time revalidation.
- Artifact path uniqueness canonicalizes both slash conventions without
  changing the persisted path value.
- Malformed runtime schema-version values produce diagnostics instead of
  throwing during Domain validation.
- Orphan artifact diagnostics sort directory entries explicitly for stable
  output.

The regression coverage added for these fixes is included in the 270-test full
run above. The browser E2E command was not rerun after these non-UI changes
because the local pnpm shim is currently blocked by its temporary-directory
permission error; the existing Golden Path PASS remains the applicable UI
evidence.

## Targeted regression commands

- direct Vitest run for the Domain, Evidence File Contract, and adapter suites
  passed with 3 files / 37 tests.
- direct Vitest run for the Evidence store, import, verify, and CLI Evidence
  suites passed with 4 files / 33 tests, including parent symlink rejection.
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
