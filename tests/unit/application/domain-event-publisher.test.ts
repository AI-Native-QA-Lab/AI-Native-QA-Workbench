import { describe, expect, it } from "vitest";

import {
  SqliteDomainEventPublisher,
  type DomainEventPublisher,
} from "@ai-native-qa-workbench/application";
import type { DomainEvent } from "@ai-native-qa-workbench/domain";
import type { RuntimeStore } from "@ai-native-qa-workbench/runtime-store";

function event(): DomainEvent {
  return {
    id: "event-quality-assessment-requested-001",
    schemaVersion: "0.3",
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

describe("SqliteDomainEventPublisher", () => {
  it("persists a validated event using the project root in its payload", async () => {
    const calls: Array<{ event: DomainEvent; projectRoot: string }> = [];
    const runtimeStore = {
      appendDomainEvent(received: DomainEvent, projectRoot: string): string {
        calls.push({ event: received, projectRoot });
        return received.id;
      },
    } as unknown as RuntimeStore;
    const publisher: DomainEventPublisher = new SqliteDomainEventPublisher({ runtimeStore });

    await publisher.publish(event());

    expect(calls).toEqual([{ event: event(), projectRoot: "/tmp/checkout-service" }]);
  });

  it("rejects an invalid event before touching the runtime store", async () => {
    let called = false;
    const runtimeStore = {
      appendDomainEvent(): string {
        called = true;
        return "unused";
      },
    } as unknown as RuntimeStore;
    const publisher = new SqliteDomainEventPublisher({ runtimeStore });

    await expect(publisher.publish({ ...event(), id: "Bad_ID" })).rejects.toThrow(
      "Invalid domain event",
    );
    expect(called).toBe(false);
  });
});
