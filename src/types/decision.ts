import { z } from "zod";

export const RiskResultSchema = z.object({
  agent: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1).optional(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type RiskResult = z.infer<typeof RiskResultSchema>;

export const DecisionSchema = z.object({
  decision: z.enum(["APPROVE", "BLOCK", "NEEDS_HUMAN"]),
  reasons: z.array(z.string()),
  riskReport: z.record(RiskResultSchema),
  auditId: z.string(),
  timestamp: z.string().datetime(),
  proposalId: z.string().optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;
