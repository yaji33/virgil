import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import { handleApi } from "../src/http/handler.js";
import { RecordStore } from "../src/records/store.js";
import type { PlanTerms } from "../src/plans/plan.js";
import { SupabaseAuth } from "../src/auth/supabase.js";

const terms: PlanTerms = {
  title: "BTC purchase",
  intent: "Buy 250 USDT of BTC once",
  accountId: "demo-account",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quoteAmount: "250",
  product: "SPOT",
  action: "BUY",
  schedule: "ONCE",
};

async function listen(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const boundary = new WorkspaceBoundary(RecordStore.memory());
  const server = createServer((req, res) => {
    void handleApi(req, res, boundary);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listen address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function cookie(response: Response): string {
  const header = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  if (!header) throw new Error("Missing session cookie");
  return header.split(";", 1)[0] ?? "";
}

describe("Workspace HTTP boundary", () => {
  it("rejects unauthenticated reads and accepts a demo session", async () => {
    const server = await listen();
    try {
      const denied = await fetch(`${server.url}/api/workspace`);
      expect(denied.status).toBe(401);
      const session = await fetch(`${server.url}/api/session`, { method: "POST" });
      expect(session.status).toBe(200);
      const header = cookie(session);
      const created = await fetch(`${server.url}/api/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: header },
        body: JSON.stringify({ terms }),
      });
      expect(created.status).toBe(201);
      const workspace = await fetch(`${server.url}/api/workspace`, {
        headers: { Cookie: header },
      });
      const body = (await workspace.json()) as { plans: { terms: { accountId: string } }[] };
      expect(body.plans).toHaveLength(1);
      expect(body.plans[0]?.terms.accountId).toBe("demo-account");
    } finally {
      await server.close();
    }
  });

  it("exchanges a verified OAuth token for an HttpOnly Virgil session", async () => {
    const boundary = new WorkspaceBoundary(RecordStore.memory());
    const auth = SupabaseAuth.fromEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      VIRGIL_OAUTH_PROVIDERS: "google,github",
    }, async () => new Response(JSON.stringify({
      id: "f08666a1-d106-4e9b-8792-18f8ed086af7",
    }), { status: 200, headers: { "Content-Type": "application/json" } }))!;
    const server = createServer((req, res) => {
      void handleApi(req, res, boundary, auth);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listen address");
    try {
      const config = await fetch(`http://127.0.0.1:${address.port}/api/auth/config`);
      await expect(config.json()).resolves.toMatchObject({ providers: ["google", "github"] });
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: "verified-access-token" }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
