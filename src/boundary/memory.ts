import { RecordStore } from "../records/store.js";
import { WorkspaceBoundary } from "./workspace.js";
import type { Plan, PlanTerms } from "../plans/plan.js";

export interface MemoryRecords {
  boot(): Promise<Awaited<ReturnType<WorkspaceBoundary["read"]>>>;
  read(): Promise<Awaited<ReturnType<WorkspaceBoundary["read"]>>>;
  create(terms: PlanTerms): Promise<Plan>;
  revise(planId: string, expectedRevision: number, terms: PlanTerms): Promise<Plan>;
  review(planId: string, expectedRevision: number): Promise<Plan>;
  approve(planId: string, expectedRevision: number): Promise<Plan>;
  setExampleHold(enabled: boolean): Promise<Awaited<ReturnType<WorkspaceBoundary["read"]>>>;
}

export function memoryRecords(): MemoryRecords {
  const boundary = new WorkspaceBoundary(RecordStore.memory());
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
    create(terms) {
      return boundary.create(requireToken(), terms);
    },
    revise(planId, expectedRevision, terms) {
      return boundary.revise(requireToken(), planId, expectedRevision, terms);
    },
    review(planId, expectedRevision) {
      return boundary.review(requireToken(), planId, expectedRevision);
    },
    approve(planId, expectedRevision) {
      return boundary.approve(requireToken(), planId, expectedRevision);
    },
    setExampleHold(enabled) {
      return boundary.setExampleHold(requireToken(), enabled);
    },
  };
}
