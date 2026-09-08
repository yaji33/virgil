import { readFileSync } from "node:fs";

export function postgresTls(env: NodeJS.ProcessEnv = process.env): {
  rejectUnauthorized: boolean;
  ca?: string;
} {
  const certificate = env.SUPABASE_DB_CA?.trim();
  if (!certificate) {
    throw new Error("SUPABASE_DB_CA must point to the project CA certificate.");
  }
  return {
    rejectUnauthorized: true,
    ca: readFileSync(certificate, "utf8"),
  };
}
