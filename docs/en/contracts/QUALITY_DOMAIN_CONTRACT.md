# Quality Domain Contract

**Status:** Implemented v0.1 MVP domain slice.

**Canonical implementation:** `packages/domain/src/quality-domain.ts`

This contract defines the smallest pure-domain representation of a requirement and
its acceptance criterion. It does not define a disk format or a workflow engine.

## Purpose

`Requirement` and `AcceptanceCriterion` provide stable in-memory data contracts for
future traceability work. They can be validated without SQLite, filesystem access,
YAML parsing, a model provider, an AI runtime, or a UI.

## Public Types

The Domain package exports these types from `@ai-native-qa-workbench/domain`:

```ts
export interface Requirement {
  id: string;
  title: string;
  description: string;
}

export interface AcceptanceCriterion {
  id: string;
  requirementId: string;
  statement: string;
}
```

`AcceptanceCriterion.requirementId` is an explicit reference instead of a nested
copy of the requirement. The current single-entity validator does not resolve that
reference.

## Validation API

The public validators return the existing `ValidationResult` contract:

```ts
export function validateRequirement(requirement: Requirement): ValidationResult;

export function validateAcceptanceCriterion(
  criterion: AcceptanceCriterion,
): ValidationResult;
```

Callers that receive untrusted runtime data may pass it through the typed API after
their boundary adapter has represented the data as the corresponding TypeScript
type. The validators still perform runtime type checks and return diagnostics for
missing or malformed fields instead of relying only on compile-time types.

## Identifier Rules

`Requirement.id`, `AcceptanceCriterion.id`, and
`AcceptanceCriterion.requirementId` must match:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

The identifier rule allows lowercase ASCII letters, digits, and single separators
between non-empty segments. Chinese characters, Unicode letters, spaces, uppercase
letters, underscores, dots, consecutive separators such as `a--b`, leading or
trailing separators, and the empty string are invalid.

The validator does not trim, slugify, or otherwise rewrite identifiers.

## Requirement Validation

`validateRequirement` appends diagnostics in this fixed order:

| Order | Code | Path | Rule |
| --- | --- | --- | --- |
| 1 | `REQUIREMENT_ID_INVALID` | `id` | `id` must match the identifier rule. |
| 2 | `REQUIREMENT_TITLE_EMPTY` | `title` | `title` must be a string whose trimmed value is not empty. |
| 3 | `REQUIREMENT_DESCRIPTION_INVALID` | `description` | `description` must be a string. An empty string is valid. |

When no diagnostics are produced, the result is `{ valid: true, diagnostics: [] }`.
The original `title` and `description` values are preserved; `trim()` is used only
for the emptiness check.

## AcceptanceCriterion Validation

`validateAcceptanceCriterion` appends diagnostics in this fixed order:

| Order | Code | Path | Rule |
| --- | --- | --- | --- |
| 1 | `ACCEPTANCE_CRITERION_ID_INVALID` | `id` | `id` must match the identifier rule. |
| 2 | `ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` must match the identifier rule. |
| 3 | `ACCEPTANCE_CRITERION_STATEMENT_EMPTY` | `statement` | `statement` must be a string whose trimmed value is not empty. |

`statement` may contain Chinese text, punctuation, and multiple lines. Leading and
trailing whitespace is valid when the trimmed value is non-empty and is preserved in
the input object.

When no diagnostics are produced, the result is `{ valid: true, diagnostics: [] }`.

## Diagnostics

`Diagnostic.code`, `path`, `severity`, diagnostic order, and `ValidationResult.valid`
are machine-readable contract fields. Every diagnostic has `severity: "error"`.

`Diagnostic.message` is a current English explanation for CLI and debugging output.
It is not a compatibility key. Consumers must branch on `code` and `path`, and tests
must not assert the complete message text as a cross-version guarantee.

Malformed runtime input such as `undefined`, `null`, numbers, or fields with the
wrong primitive type produces diagnostics and does not cause the validator to throw.

## Immutability

Both validators are pure reads. They do not mutate the input object, normalize
strings, create defaults, perform I/O, or call external services.

## Relationship Boundary

The Acceptance Criterion validator checks only the syntax of `requirementId`. It does
not check whether the referenced Requirement exists because a single-entity
validator has no collection context. Collection-level reference integrity belongs to
a future Project Store or Traceability contract.

## Out of Scope

This contract does not define:

- a Markdown, YAML, JSON, or database persistence format;
- entity-level schema versions or migration rules;
- `status`, `priority`, `owner`, `labels`, locale, timestamps, or AI metadata;
- `TraceLink` creation or graph completeness;
- AI generation, provider calls, CLI commands, UI behavior, Evidence, or workflow state.

The `.ai-qa/` project-quality source of truth remains unchanged by this Domain slice.

## Compatibility Notes

This is a v0.1 MVP Domain API. Any future persisted representation requires a separate
file contract and migration design. Changes to diagnostic codes, paths, severity, or
diagnostic order require an explicit contract review and corresponding compatibility
tests. Diagnostic message wording may evolve without changing the machine contract.
