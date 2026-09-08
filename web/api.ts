import type { Order } from "../src/execution/order.js";
import type { Plan, PlanTerms } from "../src/plans/plan.js";
import type { PlanHistory } from "../src/plans/history.js";

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
    account: { accountId: string; quoteAsset: string; balance: string; capturedAt?: string };
    exampleHold: string;
  };
  available: string;
  reserved: string;
  environment: "DEMO" | "LIVE";
  plans: Plan[];
  orders: Order[];
  activity: Activity[];
  planHistory: PlanHistory[];
}

export interface PlanRecords {
  boot(): Promise<WorkspaceSnapshot>;
  read(): Promise<WorkspaceSnapshot>;
  create(terms: PlanTerms): Promise<Plan>;
  revise(planId: string, expectedRevision: number, terms: PlanTerms): Promise<Plan>;
  review(planId: string, expectedRevision: number): Promise<Plan>;
  approve(planId: string, expectedRevision: number): Promise<Plan>;
  submit(planId: string, expectedRevision: number): Promise<Order>;
  reconcile(orderId: string): Promise<Order>;
  setExampleHold(enabled: boolean): Promise<WorkspaceSnapshot>;
}

export interface AuthRecords {
  authConfig(): Promise<{
    url: string;
    publishableKey: string;
    providers: ("google" | "github")[];
  }>;
  exchangeOAuth(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
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
    throw new ApiError(body.error?.message ?? "Unable to update the workspace.", response.status);
  }
  if (!text) throw new ApiError("The workspace API did not respond.", response.status);
  return body;
}

export function httpRecords(): PlanRecords & AuthRecords {
  return {
    authConfig() {
      return request("/api/auth/config");
    },
    async exchangeOAuth(accessToken) {
      await request("/api/auth/exchange", {
        method: "POST",
        body: JSON.stringify({ accessToken }),
      });
    },
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
    async submit(planId, expectedRevision) {
      const body = await request<{ order: Order }>(`/api/plans/${planId}/submit`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision }),
      });
      return body.order;
    },
    async reconcile(orderId) {
      const body = await request<{ order: Order }>(
        `/api/orders/${orderId}/reconcile`,
        { method: "POST" },
      );
      return body.order;
    },
    setExampleHold(enabled) {
      return request("/api/workspace/example-hold", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
    },
    async signOut() {
      await request("/api/auth/sign-out", { method: "POST" });
    },
  };
}

export function needsAuthentication(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
