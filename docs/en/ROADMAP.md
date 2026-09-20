# Roadmap

## M0 --- Repository Bootstrap

Repository structure, CI, TDD foundation, architecture checks,
documentation structure, AGENTS.md, i18n foundation.

## v0.1 --- MVP / Local-first Foundation

File-first Project Store, core Quality Domain, CLI, SQLite runtime,
Agent Execution Loop, QA Task Loop, ChangeProposal, Human Review,
Requirement Analysis, Traceability, MockProvider,
OpenAICompatibleProvider, EN/zh-CN, deterministic Golden Path.

## v0.2 --- Evidence Foundation

TestRun, Evidence, provenance, artifact reference/checksum,
JUnit/Playwright/Pytest import adapters, evidence integrity.

## v0.3 --- Quality Engineering Loop

Domain Events, workflow runtime, QualityAssessment, QualityGate,
HumanDecision, full event-driven Three Loops.

## v0.4 --- QA Skills

Skill Registry, SKILL.md loader, capability/tool requirements,
completion/evaluation contracts, local/git sources, awesome-qa-skills
integration.

## v0.5 --- Multi-model Runtime

Anthropic, Gemini, Ollama, capability negotiation, provider health,
retry/rate limits, usage/cost.

## v0.6 --- Engineering Integrations

MCP, GitHub, Jira, CI, generic test-result adapters, Cypress/REST
Assured/k6/JMeter support.

## v0.7 --- Quality Intelligence

Requirement/Risk/Obligation coverage, Evidence completeness, Quality
Gaps, Change Impact, QCov integration.

## v0.8 --- Evaluation

Skill datasets, evaluators, regression, cross-model comparison, version
comparison.

## v0.9 --- Specialized QA Agents

Requirement, Test Design, Automation, Performance and Quality Review
agents; integration points for ai-native-qa-agents.

## v1.0 --- Stable Local-first Workbench

Stabilize public contracts, schema migration, CLI, upgrade path,
documentation, provider/tool/skill contracts, evidence provenance,
human-decision boundary, Golden Paths and release process.

## 1.x --- Advanced Local Workbench

Quality Knowledge Graph, advanced change impact, persistent QA memory,
policy engine, advanced evaluation, model routing, plugin system, more
QA domains.

## 2.x Candidate --- Optional Shared Workbench

Only if validated by real user demand: shared server, PostgreSQL, shared
artifacts, organizations/workspaces, RBAC, team collaboration, central
audit and remote runtime. Local mode remains first-class.
