# Repository Bootstrap and Project Contract Design

**Status:** Approved in conversation; implementation not started.

## Goal

Start `ai-native-qa-workbench` as a real, testable repository by importing
the GitHub Blueprint, establishing the local-first TypeScript workspace, and
delivering the first executable vertical slice: `qaw init` creates a valid
`.ai-qa/project.yaml`, and `qaw validate` reports whether that project file
meets the Project File Contract.

## Understanding and source boundaries

The user's request is to start the project from the attached GitHub Blueprint
and apply the PolyForm Noncommercial License 1.0.0. The attached Markdown
package is design input: its `AGENTS.md`, contracts, roadmap, development
plans, templates, and bilingual docs become repository guidance after being
copied into the repository. They do not authorize implementing every v0.1 or
v1.0 feature in this change.

The earlier pasted repository tree describes the intended long-term shape. It
is not a complete source repository and does not override the attached
Blueprint's concrete 28-document package. This design therefore creates only
the packages needed by the first vertical slice and leaves future apps and
packages to be introduced with their owning contract and tests.

## Scope

### Included

- Copy the 28 Markdown Blueprint documents and the `.github` templates into
  the repository, excluding generated `.DS_Store` files.
- Add the root `LICENSE` with the requested PolyForm Noncommercial License
  1.0.0 text.
- Establish a pnpm workspace with Turborepo, TypeScript, Vitest, formatting,
  lint/typecheck scripts, and deterministic local CI.
- Add the pure `@ai-native-qa-workbench/domain` package with the first Project
  contract and diagnostics model.
- Add `@ai-native-qa-workbench/project-store` for YAML parsing, validation,
  deterministic serialization, and atomic project-file creation.
- Add `apps/cli` with `qaw init` and `qaw validate`.
- Add unit, contract, integration, architecture, and documentation checks
  for the behavior in this slice.
- Update English and Chinese entry documentation with the executable
  bootstrap commands and the deliberately limited current scope.

### Explicitly excluded

- React/Vite workbench UI, Fastify server, SQLite runtime store, agent loop,
  QA Task Loop, providers, tools, skills, evidence adapters, integrations,
  PostgreSQL, and Golden Path E2E beyond the init/validate slice.
- Direct AI writes to `.ai-qa/`; this slice has no AI mutation path.
- GitHub repository creation, milestones, issues, releases, tags, pushes, or
  pull requests.
- Any change to the user's existing `dsh-qa` repository. This is a new
  repository with its own domain and file contract.

## Architecture

The first slice is a one-way dependency graph:

```text
apps/cli
  -> packages/project-store
       -> packages/domain
```

`domain` contains only TypeScript values and pure functions. It must not
import filesystem, YAML, SQLite, Fastify, React, provider SDKs, MCP, GitHub,
Jira, DSH, or test-framework code.

`project-store` owns the boundary between `.ai-qa/project.yaml` and domain
objects. It is the only package in this slice allowed to access the
filesystem. It performs parse, schema validation, diagnostic conversion,
canonical serialization, and atomic writes.

`apps/cli` translates command-line arguments into store calls and maps
diagnostics to stable human-readable output and exit codes. It must not
contain domain validation or YAML parsing rules.

The root workspace owns shared tooling only. No application package may use
the runtime SQLite or future provider layers in this slice.

## Project File Contract v0.1

The first project file is `.ai-qa/project.yaml`:

```yaml
schemaVersion: "0.1"
project:
  id: "example-project"
  name: "Example project"
  description: ""
  defaultLocale: "en"
```

The contract has these invariants:

1. `schemaVersion` is exactly the supported string `"0.1"`.
2. `project.id` is a non-empty kebab-case identifier matching
   `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
3. `project.name` is a non-empty human-readable string.
4. `project.description` is a string and may be empty.
5. `project.defaultLocale` is either `en` or `zh-CN`.
6. Unknown top-level keys and unknown keys under `project` are rejected so
   schema drift cannot silently become project data.
7. A valid file is serialized with stable key order and a trailing newline.

The domain representation is locale-neutral apart from the explicitly
contracted locale value:

```ts
export type ProjectLocale = "en" | "zh-CN";

export interface Project {
  schemaVersion: "0.1";
  id: string;
  name: string;
  description: string;
  defaultLocale: ProjectLocale;
}
```

## Domain interfaces

The first package exposes pure contracts equivalent to:

```ts
export type DiagnosticCode =
  | "PROJECT_SCHEMA_UNSUPPORTED"
  | "PROJECT_ID_INVALID"
  | "PROJECT_NAME_EMPTY"
  | "PROJECT_DESCRIPTION_INVALID"
  | "PROJECT_LOCALE_INVALID";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  path: string;
  severity: "error";
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: readonly Diagnostic[];
}

export function validateProject(project: Project): ValidationResult;
export function deriveProjectId(directoryName: string): string;
```

`deriveProjectId` normalizes a directory name to lowercase kebab-case and
falls back to `project` when no valid segment remains. It is used only for
the generated initial project and is independently tested.

## Project Store interfaces

The store package owns filesystem effects behind a small interface:

```ts
export interface ProjectStore {
  initProject(input: {
    rootDirectory: string;
    name?: string;
    description?: string;
    defaultLocale?: ProjectLocale;
  }): Promise<InitProjectResult>;

  validateProject(rootDirectory: string): Promise<StoreValidationResult>;
}
```

Behavioral rules:

- `initProject` creates `.ai-qa/` and `project.yaml` only when the project
  file does not already exist.
- Existing project files are never overwritten by `init`; the command
  returns a diagnostic with a non-zero exit status.
- The store writes through a sibling temporary file and an atomic rename.
  Temporary files are removed when a write fails.
- `validateProject` distinguishes missing files, malformed YAML, unsupported
  schema versions, schema violations, and valid projects with stable
  diagnostic codes.
- A validation operation never mutates `.ai-qa/`.
- The store returns parsed domain data only after validation succeeds.

The implementation may use YAML and schema libraries at this boundary, but
those dependencies must not cross into `domain`.

Store-level diagnostics add these stable codes to the domain validation
codes: `PROJECT_FILE_MISSING`, `PROJECT_FILE_MALFORMED`, and
`PROJECT_FILE_EXISTS`. Their paths are `.ai-qa/project.yaml` for file-level
errors and the corresponding YAML path for schema errors.

## CLI contract

Supported commands:

```text
qaw init [--name <name>] [--description <description>]
         [--locale en|zh-CN] [directory]
qaw validate [directory]
```

The default directory is the current working directory. The commands emit a
short success line to stdout and diagnostics to stderr. They use exit code
`0` for success and `1` for user/project validation errors. Unknown commands
or malformed options also exit `1` with a usage diagnostic. No network access
is allowed.

The CLI is invoked in development through the workspace script and is
packaged as `qaw` by `apps/cli`. A later release may add `doctor` and `open`,
but this slice must not advertise those commands as implemented.

## Testing and verification design

The test order is contract-first:

1. Domain tests pin project invariants, diagnostics, locale handling, and ID
   derivation.
2. Project-store contract tests pin YAML parsing, unknown-key rejection,
   missing/malformed file diagnostics, canonical round trips, and atomic
   creation behavior.
3. CLI integration tests execute the real command against a temporary
   directory and assert files, stdout/stderr, and exit codes.
4. Architecture tests inspect package imports and fail if `domain` imports a
   forbidden runtime boundary.
5. Documentation checks verify every internal Markdown link resolves and the
   English/Chinese entry points mention the same current commands.

Each behavior follows RED → minimal GREEN → REFACTOR. The full local gate is
lint, typecheck, architecture checks, unit/contract/integration tests, and
documentation checks. Core CI remains offline and does not require an LLM.

## Documentation, license, and delivery

- The attached Blueprint remains the source for the repository governance
  documents; copied files are not silently rewritten into a different
  product plan.
- `README.md` is the English entry point and `README.zh-CN.md` is its Chinese
  counterpart. Both describe only the commands delivered by this slice.
- `AGENTS.md` is copied to the repository root and is binding for future
  changes.
- `LICENSE` contains the requested PolyForm Noncommercial License 1.0.0.
- This design file is an internal implementation artifact under
  `docs/superpowers/specs/`; it does not replace the public Blueprint docs.

## Acceptance criteria

The design is considered implemented only when all of the following are
verified:

- A fresh checkout installs with pnpm without a live model or network call
  during tests.
- `qaw init` creates the documented `.ai-qa/project.yaml` and a second init
  does not overwrite it.
- `qaw validate` accepts a generated project and rejects missing, malformed,
  unsupported, unknown-key, and invariant-violating project files with
  actionable diagnostics.
- The domain package passes its architecture boundary check.
- The package's unit, contract, and CLI integration tests pass.
- Internal documentation links and EN/ZH bootstrap instructions pass their
  checks.
- `git diff --check` is clean and the requested license is present at the
  repository root.
