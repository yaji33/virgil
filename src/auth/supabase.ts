import { z } from "zod";

const AuthUserSchema = z.object({ id: z.string().uuid() }).passthrough();

export interface SupabaseIdentity {
  userId: string;
  requiresConfirmation: boolean;
  sessionSeconds?: number;
}

export type OAuthProvider = "google" | "github";

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
  providers: OAuthProvider[];
}

type Fetch = typeof fetch;

export class SupabaseAuth {
  private constructor(
    private readonly url: string,
    private readonly publishableKey: string,
    private readonly providers: OAuthProvider[],
    private readonly fetchImpl: Fetch,
  ) {}

  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    fetchImpl: Fetch = fetch,
  ): SupabaseAuth | undefined {
    const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!url && !key) return undefined;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set together.");
    }
    const providers = (env.VIRGIL_OAUTH_PROVIDERS ?? "google")
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider): provider is OAuthProvider =>
        provider === "google" || provider === "github",
      );
    if (!providers.length) {
      throw new Error("VIRGIL_OAUTH_PROVIDERS must include google or github.");
    }
    return new SupabaseAuth(url, key, [...new Set(providers)], fetchImpl);
  }

  publicConfig(): SupabasePublicConfig {
    return {
      url: this.url,
      publishableKey: this.publishableKey,
      providers: this.providers,
    };
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseIdentity> {
    const response = await this.fetchImpl(`${this.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const value = await response.json().catch(() => ({})) as {
      msg?: string;
      message?: string;
      error_description?: string;
    };
    if (!response.ok) {
      throw new Error(
        value.msg ?? value.message ?? value.error_description ?? "OAuth session could not be verified.",
      );
    }
    const user = AuthUserSchema.parse(value);
    return {
      userId: user.id,
      requiresConfirmation: false,
      sessionSeconds: tokenLifetime(accessToken),
    };
  }

}

function tokenLifetime(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== "number") return 3600;
    return Math.max(60, Math.min(Math.floor(payload.exp - Date.now() / 1000), 3600));
  } catch {
    return 3600;
  }
}
