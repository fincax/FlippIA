/**
 * Domain events. In-process bus for now (modular monolith). The event names and
 * payload contracts are what matter: a durable broker can replace the bus later
 * without touching producers or consumers.
 */
export type DomainEventName =
  | "PropertyCreated"
  | "OpportunityDetected"
  | "PriceChanged"
  | "EvidenceUpdated"
  | "RegulationChanged"
  | "UrbanismAssessmentCompleted"
  | "MarketAssessmentCompleted"
  | "ArchitectureAssessmentCompleted"
  | "ScenarioUpdated"
  | "DealInputUpdated"
  | "RiskDetected"
  | "AnalysisCompleted"
  | "DealCreated"
  | "DealApproved"
  | "DealAcquired"
  | "WatchTriggered"
  | "ProjectStarted"
  | "BudgetChanged"
  | "MilestoneDelayed"
  | "OfferReceived"
  | "ProjectCompleted"
  | "HumanReviewRecorded";

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  name: DomainEventName;
  occurredAt: string;
  organizationId: string;
  actorId?: string;
  dealId?: string;
  payload: TPayload;
}

type Handler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<DomainEventName | "*", Set<Handler>>();
  private history: DomainEvent[] = [];

  on(name: DomainEventName | "*", handler: Handler): () => void {
    const set = this.handlers.get(name) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(name, set);
    return () => set.delete(handler);
  }

  async emit(event: DomainEvent): Promise<void> {
    this.history.push(event);
    if (this.history.length > 500) this.history.shift();
    const targets = [...(this.handlers.get(event.name) ?? []), ...(this.handlers.get("*") ?? [])];
    await Promise.all(targets.map((h) => h(event)));
  }

  recent(limit = 50): DomainEvent[] {
    return this.history.slice(-limit);
  }
}

let bus: EventBus | undefined;
export function eventBus(): EventBus {
  bus ??= new EventBus();
  return bus;
}
