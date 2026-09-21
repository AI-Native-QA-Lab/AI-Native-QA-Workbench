# Changelog

All notable changes to this project will be documented here.

The project follows a pre-1.0 capability roadmap and will define
compatibility guarantees before the v1.0 stable release.

## [Unreleased]

- Completed the local-first v0.1 MVP implementation: quality snapshot and
  traceability, atomic ChangeProposal apply with explicit Human Review, SQLite
  runtime state, Tool/Provider/Agent contracts, QA Task completion loop,
  Requirement Analysis, CLI commands, local API, and React/Vite Workbench UI.
- Added independent English and `zh-CN` UI/provider locale handling, bilingual
  public contracts, and a deterministic no-network Playwright Golden Path.
- Expanded CI to install Chromium, run all offline quality gates, and execute
  the Golden Path browser test without a live LLM.
- Kept TestRun/Evidence/QualityAssessment/QualityGate/Domain Events, external
  integrations, remote runtime, and PostgreSQL outside the v0.1 gate; these
  remain roadmap work rather than hidden implementation evidence.

## [0.1.0] - 2026-09-21

- Imported the GitHub repository Blueprint and added the PolyForm
  Noncommercial License 1.0.0.
- Added the pnpm workspace foundation with domain, project-store, and CLI
  packages.
- Added the `.ai-qa/project.yaml` Project File Contract with deterministic
  validation, atomic initialization, and overwrite protection.
- Added `qaw init` and `qaw validate` with offline integration coverage.
- Added architecture, documentation, and offline CI quality gates.
- Added the Requirement and AcceptanceCriterion domain contracts with deterministic
  validation diagnostics and bilingual contract documentation.
- Added the QualityRisk and TestObligation domain contracts with deterministic
  validation diagnostics and bilingual contract documentation.
- Added the TestCase domain contract with deterministic validation diagnostics and
  bilingual contract documentation.
