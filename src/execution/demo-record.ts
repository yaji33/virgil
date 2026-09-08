import { z } from "zod";
import { SpotBuyRequestSchema } from "./adapter.js";

export const DemoOrderRecordSchema = z.object({
  id: z.string().min(1).max(128),
  request: SpotBuyRequestSchema,
  outcome: z.enum(["unknown", "rejected", "partial", "filled"]),
}).strict().refine((record) => record.id === record.request.idempotencyKey);

export type DemoOrderRecord = z.infer<typeof DemoOrderRecordSchema>;
