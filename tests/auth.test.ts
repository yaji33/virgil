import { describe, expect, it, vi } from "vitest";
import { SupabaseAuth } from "../src/auth/supabase.js";
import { WorkspaceBoundary } from "../src/boundary/workspace.js";
import { RecordStore } from "../src/records/store.js";

const userId = "f08666a1-d106-4e9b-8792-18f8ed086af7";

describe("Supabase authentication", () => {
  it("exposes OAuth configuration and verifies a provider access token", async () => {
    const token = [
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url"),
      "signature",
    ].join(".");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: userId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    const auth = SupabaseAuth.fromEnv({
      SUPABASE_URL: "https://project.supabase.co/",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      VIRGIL_OAUTH_PROVIDERS: "google,github,google",
    }, fetchImpl)!;

    expect(auth.publicConfig()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "sb_publishable_test",
      providers: ["google", "github"],
    });
    await expect(auth.verifyAccessToken(token)).resolves.toMatchObject({
      userId,
      requiresConfirmation: false,
      sessionSeconds: expect.any(Number),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/user",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          apikey: "sb_publishable_test",
          Authorization: `Bearer ${token}`,
        }),
      }),
    );
  });

  it("keeps authenticated users in separate workspaces", async () => {
    const boundary = new WorkspaceBoundary(RecordStore.memory());
    const first = await boundary.openAuthenticatedSession(userId);
    const resumed = await boundary.openAuthenticatedSession(userId, first.token);
    const second = await boundary.openAuthenticatedSession(
      "36b604d9-d872-43fe-a836-ec844440559d",
    );

    expect(resumed.actor.workspaceId).toBe(first.actor.workspaceId);
    expect(second.actor.workspaceId).not.toBe(first.actor.workspaceId);
    await boundary.closeSession(first.token);
    await expect(boundary.currentSession(first.token)).rejects.toMatchObject({
      status: 401,
    });
  });
});
