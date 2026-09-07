import { z } from "zod";

/**
 * User-defined mandate that the deterministic policy engine evaluates against.
 * Follows patterns common in professional trading risk systems.
 */
export const MandateSchema = z.object({
  name: z.string().min(1),
  maxCapitalUsd: z.number().positive(),
  maxPositionSizeUsd: z.number().positive(),
  maxDailyLossUsd: z.number().nonnegative(),
  allowedAssets: z.array(z.string().min(1)).min(1),
  allowedProducts: z.array(z.enum(["SPOT", "MARGIN", "FUTURES", "CONVERT"])).min(1),
  requireHumanApprovalAboveUsd: z.number().nonnegative().optional(),
  maxConcentrationPct: z.number().min(0).max(100).optional(),
  blockedActions: z.array(z.string()).optional().default([]),
  // Extensible for future rules
  metadata: z.record(z.unknown()).optional(),
});

export type Mandate = z.infer<typeof MandateSchema>;

export const ProposalSchema = z.object({
  id: z.string().uuid().optional(),
  action: z.enum(["BUY", "SELL", "CONVERT", "TRANSFER_INTERNAL", "OTHER"]),
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]).optional(),
  quantity: z.number().positive().optional(),
  quoteQuantityUsd: z.number().positive().optional(),
  product: z.enum(["SPOT", "MARGIN", "FUTURES", "CONVERT"]),
  limitPrice: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Proposal = z.infer<typeof ProposalSchema>;
