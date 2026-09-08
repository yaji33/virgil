import type { ExecutionAdapter } from "../execution/adapter.js";
import type { Order } from "../execution/order.js";
import { RecordStore } from "../records/store.js";
import { WorkspaceBoundary } from "./workspace.js";
import type { Plan, PlanTerms } from "../plans/plan.js";

export function memoryRecords(exchange?: ExecutionAdapter) {
  const boundary = new WorkspaceBoundary(RecordStore.memory(), exchange);
  let token: string | undefined;
  const requireToken = () => token;
  return {
    async boot() {
      const session = await boundary.openSession(token);
      token = session.token;
      return boundary.read(token);
    },
    read() {
      return boundary.read(requireToken());
    },
    create(terms: PlanTerms): Promise<Plan> {
      return boundary.create(requireToken(), terms);
    },
    revise(planId: string, expectedRevision: number, terms: PlanTerms): Promise<Plan> {
      return boundary.revise(requireToken(), planId, expectedRevision, terms);
    },
    review(planId: string, expectedRevision: number): Promise<Plan> {
      return boundary.review(requireToken(), planId, expectedRevision);
    },
    approve(planId: string, expectedRevision: number): Promise<Plan> {
      return boundary.approve(requireToken(), planId, expectedRevision);
    },
    submit(planId: string, expectedRevision: number): Promise<Order> {
      return boundary.submit(requireToken(), planId, expectedRevision);
    },
    reconcile(orderId: string): Promise<Order> {
      return boundary.reconcile(requireToken(), orderId);
    },
    setExampleHold(enabled: boolean) {
      return boundary.setExampleHold(requireToken(), enabled);
    },
  };
}
