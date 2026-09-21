# Quality Domain Contract

**Status:** Implemented v0.1 MVP domain slice.

**Canonical implementation:** `packages/domain/src/quality-domain.ts`

This contract defines the smallest pure-domain representation of requirements,
acceptance criteria, quality risks, test obligations, and test cases. It does not
define a disk format or a workflow engine.

## Purpose

`Requirement`, `AcceptanceCriterion`, `QualityRisk`, `TestObligation`, and `TestCase`
provide stable in-memory data contracts for future traceability work. They can be
validated without SQLite, filesystem access, YAML parsing, a model provider, an AI
runtime, or a UI.

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

export interface QualityRisk {
  id: string;
  requirementId: string;
  statement: string;
}

export interface TestObligation {
  id: string;
  riskId: string;
  statement: string;
}

export interface TestCase {
  id: string;
  obligationId: string;
  title: string;
  steps: string;
  expectedResult: string;
}
```

`AcceptanceCriterion.requirementId` and `QualityRisk.requirementId` are explicit
references instead of nested copies of the requirement. `TestObligation.riskId` is an
explicit reference to the quality risk. `TestCase.obligationId` is an explicit
reference to the test obligation. The current single-entity validators do not resolve
these references.

## Validation API

The public validators return the existing `ValidationResult` contract:

```ts
export function validateRequirement(requirement: Requirement): ValidationResult;

export function validateAcceptanceCriterion(criterion: AcceptanceCriterion): ValidationResult;

export function validateQualityRisk(risk: QualityRisk): ValidationResult;

export function validateTestObligation(obligation: TestObligation): ValidationResult;

export function validateTestCase(testCase: TestCase): ValidationResult;
```

Callers that receive untrusted runtime data may pass it through the typed API after
their boundary adapter has represented the data as the corresponding TypeScript
type. The validators still perform runtime type checks and return diagnostics for
missing or malformed fields instead of relying only on compile-time types.

## Identifier Rules

`Requirement.id`, `AcceptanceCriterion.id`, `AcceptanceCriterion.requirementId`,
`QualityRisk.id`, `QualityRisk.requirementId`, `TestObligation.id`,
`TestObligation.riskId`, `TestCase.id`, and `TestCase.obligationId` must match:

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

| Order | Code                              | Path          | Rule                                                       |
| ----- | --------------------------------- | ------------- | ---------------------------------------------------------- |
| 1     | `REQUIREMENT_ID_INVALID`          | `id`          | `id` must match the identifier rule.                       |
| 2     | `REQUIREMENT_TITLE_EMPTY`         | `title`       | `title` must be a string whose trimmed value is not empty. |
| 3     | `REQUIREMENT_DESCRIPTION_INVALID` | `description` | `description` must be a string. An empty string is valid.  |

When no diagnostics are produced, the result is `{ valid: true, diagnostics: [] }`.
The original `title` and `description` values are preserved; `trim()` is used only
for the emptiness check.

## AcceptanceCriterion Validation

`validateAcceptanceCriterion` appends diagnostics in this fixed order:

| Order | Code                                          | Path            | Rule                                                           |
| ----- | --------------------------------------------- | --------------- | -------------------------------------------------------------- |
| 1     | `ACCEPTANCE_CRITERION_ID_INVALID`             | `id`            | `id` must match the identifier rule.                           |
| 2     | `ACCEPTANCE_CRITERION_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` must match the identifier rule.                |
| 3     | `ACCEPTANCE_CRITERION_STATEMENT_EMPTY`        | `statement`     | `statement` must be a string whose trimmed value is not empty. |

`statement` may contain Chinese text, punctuation, and multiple lines. Leading and
trailing whitespace is valid when the trimmed value is non-empty and is preserved in
the input object.

When no diagnostics are produced, the result is `{ valid: true, diagnostics: [] }`.

## QualityRisk and TestObligation Validation

`QualityRisk` belongs to a `Requirement`, while `TestObligation` describes a quality
behavior that must be verified for a `QualityRisk`. The validators append diagnostics
in these fixed orders:

### QualityRisk

| Order | Code                                  | Path            | Rule                                                           |
| ----- | ------------------------------------- | --------------- | -------------------------------------------------------------- |
| 1     | `QUALITY_RISK_ID_INVALID`             | `id`            | `id` must match the identifier rule.                           |
| 2     | `QUALITY_RISK_REQUIREMENT_ID_INVALID` | `requirementId` | `requirementId` must match the identifier rule.                |
| 3     | `QUALITY_RISK_STATEMENT_EMPTY`        | `statement`     | `statement` must be a string whose trimmed value is not empty. |

### TestObligation

| Order | Code                              | Path        | Rule                                                           |
| ----- | --------------------------------- | ----------- | -------------------------------------------------------------- |
| 1     | `TEST_OBLIGATION_ID_INVALID`      | `id`        | `id` must match the identifier rule.                           |
| 2     | `TEST_OBLIGATION_RISK_ID_INVALID` | `riskId`    | `riskId` must match the identifier rule.                       |
| 3     | `TEST_OBLIGATION_STATEMENT_EMPTY` | `statement` | `statement` must be a string whose trimmed value is not empty. |

Both `statement` fields may contain Chinese text, punctuation, and multiple lines.
Leading and trailing whitespace is valid when the trimmed value is non-empty and is
preserved in the input object. A syntactically valid but currently unloaded
`requirementId` or `riskId` passes its single-entity validator.

## TestCase Validation

`TestCase` describes one concrete test case for a `TestObligation`. The
`obligationId` validator checks only identifier syntax; it does not resolve whether
the referenced obligation exists. The validator appends diagnostics in this fixed
order:

| Order | Code                              | Path             | Rule                                                                |
| ----- | --------------------------------- | ---------------- | ------------------------------------------------------------------- |
| 1     | `TEST_CASE_ID_INVALID`            | `id`             | `id` must match the identifier rule.                                |
| 2     | `TEST_CASE_OBLIGATION_ID_INVALID` | `obligationId`   | `obligationId` must match the identifier rule.                      |
| 3     | `TEST_CASE_TITLE_EMPTY`           | `title`          | `title` must be a string whose trimmed value is not empty.          |
| 4     | `TEST_CASE_STEPS_EMPTY`           | `steps`          | `steps` must be a string whose trimmed value is not empty.          |
| 5     | `TEST_CASE_EXPECTED_RESULT_EMPTY` | `expectedResult` | `expectedResult` must be a string whose trimmed value is not empty. |

`title`, `steps`, and `expectedResult` may contain Chinese text, punctuation, and
multiple lines. Leading and trailing whitespace is valid when the trimmed value is
non-empty and is preserved in the input object. A syntactically valid but currently
unloaded `obligationId` passes the single-entity validator.

## Diagnostics

`Diagnostic.code`, `path`, `severity`, diagnostic order, and `ValidationResult.valid`
are machine-readable contract fields. Every diagnostic has `severity: "error"`.

The eleven QualityRisk/TestObligation/TestCase codes are:

| Code                                  | Path             | Meaning                                                |
| ------------------------------------- | ---------------- | ------------------------------------------------------ |
| `QUALITY_RISK_ID_INVALID`             | `id`             | Quality risk `id` has invalid syntax.                  |
| `QUALITY_RISK_REQUIREMENT_ID_INVALID` | `requirementId`  | Quality risk `requirementId` has invalid syntax.       |
| `QUALITY_RISK_STATEMENT_EMPTY`        | `statement`      | Quality risk `statement` is not a non-empty string.    |
| `TEST_OBLIGATION_ID_INVALID`          | `id`             | Test obligation `id` has invalid syntax.               |
| `TEST_OBLIGATION_RISK_ID_INVALID`     | `riskId`         | Test obligation `riskId` has invalid syntax.           |
| `TEST_OBLIGATION_STATEMENT_EMPTY`     | `statement`      | Test obligation `statement` is not a non-empty string. |
| `TEST_CASE_ID_INVALID`                | `id`             | Test case `id` has invalid syntax.                     |
| `TEST_CASE_OBLIGATION_ID_INVALID`     | `obligationId`   | Test case `obligationId` has invalid syntax.           |
| `TEST_CASE_TITLE_EMPTY`               | `title`          | Test case `title` is not a non-empty string.           |
| `TEST_CASE_STEPS_EMPTY`               | `steps`          | Test case `steps` is not a non-empty string.           |
| `TEST_CASE_EXPECTED_RESULT_EMPTY`     | `expectedResult` | Test case `expectedResult` is not a non-empty string.  |

`Diagnostic.message` is a current English explanation for CLI and debugging output.
It is not a compatibility key. Consumers must branch on `code` and `path`, and tests
must not assert the complete message text as a cross-version guarantee.

Malformed runtime input such as `undefined`, `null`, numbers, strings, or fields with
the wrong primitive type produces diagnostics and does not cause a validator to throw.

## Immutability

All five validators are pure reads. They do not mutate the input object, normalize
strings, create defaults, perform I/O, or call external services.

## Relationship Boundary

The `AcceptanceCriterion` and `QualityRisk` validators check only the syntax of their
`requirementId` references. The `TestObligation` validator checks only the syntax of
its `riskId` reference. The `TestCase` validator checks only the syntax of its
`obligationId` reference. These validators do not check whether referenced entities
exist because a single-entity validator has no collection context. Collection-level
duplicate IDs, broken references, and graph completeness belong to a future Project
Store or Traceability contract.

`QualityRisk` does not require an `acceptanceCriterionId`; a risk may cover multiple
acceptance criteria. More specific criterion links belong to a future Traceability
contract.

## Out of Scope

This contract does not define:

- a Markdown, YAML, JSON, or database persistence format;
- entity-level schema versions or migration rules;
- `status`, `riskSeverity`, `likelihood`, `priority`, `owner`, `mitigation`,
  `testLevel`, `locale`, timestamps, or AI metadata for QualityRisk/TestObligation;
- `status`, `priority`, `kind`, `automationRef`, execution targets, run results,
  step arrays, parameterization, or assertion DSLs for TestCase;
- `TraceLink` creation or graph completeness;
- AI generation, provider calls, CLI commands, UI behavior, Evidence, or workflow state.

The `.ai-qa/` project-quality source of truth remains unchanged by this Domain slice.

## Compatibility Notes

This is a v0.1 MVP Domain API. Any future persisted representation requires a separate
file contract and migration design. Changes to diagnostic codes, paths, severity, or
diagnostic order require an explicit contract review and corresponding compatibility
tests. Diagnostic message wording may evolve without changing the machine contract.
