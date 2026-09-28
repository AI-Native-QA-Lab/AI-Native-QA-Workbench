import { isValidKebabCaseId } from "./identifiers.js";
import type { Diagnostic, ValidationResult } from "./project.js";

export const DOMAIN_EVENT_SCHEMA_VERSION = "0.3" as const;

export type DomainEventType =
  | "quality.assessment.requested"
  | "quality.proposal.applied"
  | "evidence.imported"
  | "quality.assessment.created"
  | "quality.gate.evaluated"
  | "quality.human-decision.recorded";

export type DomainEventSource = "application" | "workflow" | "human";

export type DomainAggregateType = "project" | "quality" | "evidence" | "assessment" | "gate";

export interface DomainEvent<TPayload = unknown> {
  id: string;
  schemaVersion: typeof DOMAIN_EVENT_SCHEMA_VERSION;
  type: DomainEventType;
  aggregateType: DomainAggregateType;
  aggregateId: string;
  occurredAt: string;
  source: DomainEventSource;
  payload: TPayload;
}

const domainEventTypes: readonly DomainEventType[] = [
  "quality.assessment.requested",
  "quality.proposal.applied",
  "evidence.imported",
  "quality.assessment.created",
  "quality.gate.evaluated",
  "quality.human-decision.recorded",
];

const domainEventSources: readonly DomainEventSource[] = ["application", "workflow", "human"];
const domainAggregateTypes: readonly DomainAggregateType[] = [
  "project",
  "quality",
  "evidence",
  "assessment",
  "gate",
];

function diagnostic(code: Diagnostic["code"], path: string, message: string): Diagnostic {
  return { code, path, message, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRfc3339WithTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1]! &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 60 &&
    offsetHour >= 0 &&
    offsetHour <= 23 &&
    offsetMinute >= 0 &&
    offsetMinute <= 59
  );
}

function isJsonSafeValue(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  seen: Set<object>,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      diagnostics.push(
        diagnostic("DOMAIN_EVENT_PAYLOAD_INVALID", path, "Payload numbers must be finite."),
      );
    }
    return;
  }
  if (typeof value !== "object" || value === undefined) {
    diagnostics.push(
      diagnostic("DOMAIN_EVENT_PAYLOAD_INVALID", path, "Payload must contain JSON-safe values."),
    );
    return;
  }
  if (seen.has(value)) {
    diagnostics.push(
      diagnostic("DOMAIN_EVENT_PAYLOAD_INVALID", path, "Payload must not contain cycles."),
    );
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => isJsonSafeValue(item, `${path}[${index}]`, diagnostics, seen));
  } else if (
    Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null
  ) {
    for (const [key, nested] of Object.entries(value)) {
      isJsonSafeValue(nested, `${path}.${key}`, diagnostics, seen);
    }
  } else {
    diagnostics.push(
      diagnostic("DOMAIN_EVENT_PAYLOAD_INVALID", path, "Payload must contain JSON-safe objects."),
    );
  }

  seen.delete(value);
}

export function validateDomainEvent(input: unknown): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    diagnostics.push(diagnostic("DOMAIN_EVENT_INVALID", "$", "Domain event must be a mapping."));
    return { valid: false, diagnostics };
  }

  if (input.schemaVersion !== DOMAIN_EVENT_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "DOMAIN_EVENT_SCHEMA_UNSUPPORTED",
        "schemaVersion",
        "Unsupported domain event schema version.",
      ),
    );
  }
  if (!isValidKebabCaseId(input.id)) {
    diagnostics.push(diagnostic("DOMAIN_EVENT_ID_INVALID", "id", "Event id must use kebab-case."));
  }
  if (!domainEventTypes.includes(input.type as DomainEventType)) {
    diagnostics.push(diagnostic("DOMAIN_EVENT_TYPE_INVALID", "type", "Event type is invalid."));
  }
  if (!domainAggregateTypes.includes(input.aggregateType as DomainAggregateType)) {
    diagnostics.push(
      diagnostic(
        "DOMAIN_EVENT_AGGREGATE_TYPE_INVALID",
        "aggregateType",
        "Aggregate type is invalid.",
      ),
    );
  }
  if (!isValidKebabCaseId(input.aggregateId)) {
    diagnostics.push(
      diagnostic(
        "DOMAIN_EVENT_AGGREGATE_ID_INVALID",
        "aggregateId",
        "Aggregate id must use kebab-case.",
      ),
    );
  }
  if (!isRfc3339WithTimezone(input.occurredAt)) {
    diagnostics.push(
      diagnostic(
        "DOMAIN_EVENT_TIME_INVALID",
        "occurredAt",
        "Event time must be RFC 3339 with a timezone.",
      ),
    );
  }
  if (!domainEventSources.includes(input.source as DomainEventSource)) {
    diagnostics.push(
      diagnostic("DOMAIN_EVENT_SOURCE_INVALID", "source", "Event source is invalid."),
    );
  }

  isJsonSafeValue(input.payload, "payload", diagnostics, new Set<object>());

  return { valid: diagnostics.length === 0, diagnostics };
}
