import type { IncomingMessage, ServerResponse } from "node:http";
import { cookieHeader, readCookie } from "../auth/session.js";
import { BoundaryError } from "../boundary/errors.js";
import { WorkspaceBoundary } from "../boundary/workspace.js";
import { PlanTermsSchema } from "../plans/plan.js";

const RevisionSchema = {
  parse(value: unknown): number {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1
    ) {
      throw new BoundaryError("expectedRevision is required.", 400, "INVALID");
    }
    return value;
  },
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BoundaryError("Send JSON.", 400, "INVALID");
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, error: unknown): void {
  if (error instanceof BoundaryError) {
    send(res, error.status, { error: { code: error.code, message: error.message } });
    return;
  }
  send(res, 500, {
    error: { code: "INTERNAL", message: "Unable to update the workspace." },
  });
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  boundary: WorkspaceBoundary,
): Promise<boolean> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (!url.pathname.startsWith("/api/")) return false;
  const token = readCookie(req.headers.cookie);
  try {
    if (url.pathname === "/api/session" && req.method === "POST") {
      const session = await boundary.openSession(token);
      res.setHeader("Set-Cookie", cookieHeader(session.token));
      send(res, 200, { actor: session.actor });
      return true;
    }
    if (url.pathname === "/api/workspace" && req.method === "GET") {
      send(res, 200, await boundary.read(token));
      return true;
    }
    if (url.pathname === "/api/workspace/example-hold" && req.method === "POST") {
      const body = (await readJson(req)) as { enabled?: unknown };
      if (typeof body.enabled !== "boolean") {
        throw new BoundaryError("enabled must be a boolean.", 400, "INVALID");
      }
      send(res, 200, await boundary.setExampleHold(token, body.enabled));
      return true;
    }
    if (url.pathname === "/api/plans" && req.method === "POST") {
      const body = (await readJson(req)) as { terms?: unknown };
      send(res, 201, { plan: await boundary.create(token, PlanTermsSchema.parse(body.terms)) });
      return true;
    }
    const planRoute = url.pathname.match(
      /^\/api\/plans\/([0-9a-f-]{36})\/(revise|review|approve)$/,
    );
    if (planRoute && req.method === "POST") {
      const [, planId, action] = planRoute;
      const body = (await readJson(req)) as {
        expectedRevision?: unknown;
        terms?: unknown;
      };
      const expectedRevision = RevisionSchema.parse(body.expectedRevision);
      if (action === "revise") {
        send(res, 200, {
          plan: await boundary.revise(
            token,
            planId,
            expectedRevision,
            PlanTermsSchema.parse(body.terms),
          ),
        });
        return true;
      }
      if (action === "review") {
        send(res, 200, {
          plan: await boundary.review(token, planId, expectedRevision),
        });
        return true;
      }
      send(res, 200, {
        plan: await boundary.approve(token, planId, expectedRevision),
      });
      return true;
    }
    send(res, 404, { error: { code: "NOT_FOUND", message: "Unknown API route." } });
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      send(res, 400, {
        error: { code: "INVALID", message: "Enter valid plan terms." },
      });
      return true;
    }
    fail(res, error);
  }
  return true;
}
