# Technology Stack

## Core

TypeScript 5.x, Node.js 22.22.2+, pnpm, Turborepo.

## Frontend

React, Vite, React Router, shadcn/ui + Radix UI, Tailwind CSS, TanStack
Query, Zustand, i18next.

## Backend

Fastify, Zod, JSON Schema, SSE.

## Storage

Project quality data uses Markdown/YAML/JSON files. Runtime state uses
local SQLite via better-sqlite3. Large artifacts stay on the filesystem.
PostgreSQL is reserved for a future optional Shared Workbench profile.

## Testing

Vitest, Testing Library, Playwright, MockProvider and reusable
contract-test suites.

## v0.x Non-goals

Redis, Kafka, required PostgreSQL, complex ORM, vector database, object
storage and Kubernetes.
