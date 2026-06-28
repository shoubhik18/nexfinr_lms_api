import { z } from 'zod';

export const watchProgressSchema = z.object({
  watchProgressPercent: z.number().min(0).max(100),
  /** Seconds watched since the last report (capped server-side). */
  watchTimeDeltaSeconds: z.number().min(0).max(120).optional(),
});

export type WatchProgressInput = z.infer<typeof watchProgressSchema>;
