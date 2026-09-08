import type { Plan, PlanTerms } from "../src/plans/plan.js";

export interface Actor {
  userId: string;
  workspaceId: string;
}

export interface Activity {
  id: string;
  planId: string;
  title: string;
  revision: number;
  message: string;
  time: string;
}

export interface WorkspaceSnapshot {
  actor: Actor;
  workspace: {
    id: string;
    account: { accountId: string; quoteAsset: string; balance: string };
    exampleHold: string;
  };
  available: string;
  plans: Plan[];
  activity: Activity[];
}

export interface PlanRecords {
  boot(): Promise<WorkspaceSnapshot>;
  read(): Promise<WorkspaceSnapshot>;
  create(terms: PlanTerms): Promise<Plan>;
  revise(planId: string, expectedRevision: number, terms: PlanTerms): Promise<Plan>;
  review(planId: string, expectedRevision: number): Promise<Plan>;
  approve(planId: string, expectedRevision: number): Promise<Plan>;
  setExampleHold(enabled: boolean): Promise<WorkspaceSnapshot>;
}

class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
  });
  const text = await response.text();
  const body = text
    ? (JSON.parse(text) as { error?: { message?: string } } & T)
    : ({} as { error?: { message?: string } } & T);
  if (!response.ok) {
    throw new ApiError(body.error?.message ?? "Unable to update the workspace.");
  }
  if (!text) throw new ApiError("The local workspace API did not respond.");
  return body;
}

export function httpRecords(): PlanRecords {
  return {
    async boot() {
      await request("/api/session", { method: "POST" });
      return request("/api/workspace");
    },
    read() {
      return request("/api/workspace");
    },
    async create(terms) {
      const body = await request<{ plan: Plan }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({ terms }),
      });
      return body.plan;
    },
    async revise(planId, expectedRevision, terms) {
      const body = await request<{ plan: Plan }>(`/api/plans/${planId}/revise`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision, terms }),
      });
      return body.plan;
    },
    async review(planId, expectedRevision) {
      const body = await request<{ plan: Plan }>(`/api/plans/${planId}/review`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
      return body.plan;
    },
    async approve(planId, expectedRevision) {
      const body = await request<{ plan: Plan }>(`/api/plans/${planId}/approve`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
      return body.plan;
    },
    setExampleHold(enabled) {
      return request("/api/workspace/example-hold", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
    },
  };
}
