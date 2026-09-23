import { z } from 'zod';

/** One row of the legacy-ERP CSV export (headers: invoice_no,state,total,ccy,invoice_date). */
export const LegacyRowSchema = z.object({
  invoice_no: z.string().min(1),
  state: z.string().min(1),
  total: z.string().regex(/^\d+(\.\d+)?$/, 'total must be a decimal number'),
  ccy: z.string().length(3),
  invoice_date: z.string().min(1), // ISO date or datetime
});

export type LegacyRow = z.infer<typeof LegacyRowSchema>;
