import { validateDomainEvent, type DomainEvent } from "@ai-native-qa-workbench/domain";
import type { RuntimeStore } from "@ai-native-qa-workbench/runtime-store";

export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

function projectRootFromPayload(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const projectRoot = (payload as { projectRoot?: unknown }).projectRoot;
  return typeof projectRoot === "string" && projectRoot.length > 0 ? projectRoot : undefined;
}

export class SqliteDomainEventPublisher implements DomainEventPublisher {
  private readonly runtimeStore: RuntimeStore;
  private readonly defaultProjectRoot: string | undefined;

  constructor(input: { runtimeStore: RuntimeStore; projectRoot?: string }) {
    this.runtimeStore = input.runtimeStore;
    this.defaultProjectRoot = input.projectRoot;
  }

  async publish(event: DomainEvent): Promise<void> {
    const validation = validateDomainEvent(event);
    if (!validation.valid) throw new Error("Invalid domain event.");
    const projectRoot = projectRootFromPayload(event.payload) ?? this.defaultProjectRoot;
    if (!projectRoot) throw new Error("Domain event project root is required.");
    this.runtimeStore.appendDomainEvent(event, projectRoot);
  }
}
