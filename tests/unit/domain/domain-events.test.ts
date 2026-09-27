import { describe, expect, it } from "vitest";

import {
  DOMAIN_EVENT_SCHEMA_VERSION,
  validateDomainEvent,
  type DomainEvent,
} from "@ai-native-qa-workbench/domain";

function validEvent(): DomainEvent {
  return {
    id: "event-quality-assessment-requested-001",
    schemaVersion: DOMAIN_EVENT_SCHEMA_VERSION,
    type: "quality.assessment.requested",
    aggregateType: "project",
    aggregateId: "checkout-service",
    occurredAt: "2026-09-27T08:00:00Z",
    source: "application",
    payload: {
      projectRoot: "/tmp/checkout-service",
      target: { type: "project" },
      gateKind: "release-readiness",
    },
  };
}

describe("validateDomainEvent", () => {
  it("accepts the v0.3 assessment request envelope", () => {
    expect(validateDomainEvent(validEvent())).toEqual({ valid: true, diagnostics: [] });
  });

  it("accepts every supported event type with a JSON-safe payload", () => {
    const event = validEvent();
    const eventTypes = [
      "quality.assessment.requested",
      "quality.proposal.applied",
      "evidence.imported",
      "quality.assessment.created",
      "quality.gate.evaluated",
      "quality.human-decision.recorded",
    ] as const;

    for (const type of eventTypes) {
      expect(validateDomainEvent({ ...event, type })).toEqual({ valid: true, diagnostics: [] });
    }
  });

  it("rejects unsupported schema, type, aggregate, source, time, and ids", () => {
    const result = validateDomainEvent({
      ...validEvent(),
      id: "Bad_ID",
      schemaVersion: "0.2",
      type: "unsupported.event",
      aggregateType: "unsupported",
      aggregateId: "Bad_ID",
      occurredAt: "2026-02-31T01:00:00Z",
      source: "model",
    } as unknown as DomainEvent);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "DOMAIN_EVENT_ID_INVALID",
        "DOMAIN_EVENT_SCHEMA_UNSUPPORTED",
        "DOMAIN_EVENT_TYPE_INVALID",
        "DOMAIN_EVENT_AGGREGATE_TYPE_INVALID",
        "DOMAIN_EVENT_AGGREGATE_ID_INVALID",
        "DOMAIN_EVENT_TIME_INVALID",
        "DOMAIN_EVENT_SOURCE_INVALID",
      ]),
    );
  });

  it("rejects a payload that is not JSON-safe without interpreting its business shape", () => {
    const result = validateDomainEvent({
      ...validEvent(),
      payload: { nested: { value: Number.NaN } },
    });

    expect(result).toMatchObject({ valid: false });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DOMAIN_EVENT_PAYLOAD_INVALID",
        path: "payload.nested.value",
      }),
    );
  });

  it.each([undefined, null, 42, "not-an-event", []])(
    "does not throw for malformed whole input %j",
    (value) => {
      expect(() => validateDomainEvent(value)).not.toThrow();
      expect(validateDomainEvent(value).valid).toBe(false);
    },
  );
});
