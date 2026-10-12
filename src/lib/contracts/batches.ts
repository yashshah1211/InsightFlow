import { z } from 'zod';

// Additive protocol. Frozen domain v1.0.0 remains independent.
export const BatchesQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  batchId: z.uuid().optional(),
});
export const PrivateBatch = z.strictObject({
  id: z.uuid(), filename: z.string().min(1).max(255),
  source: z.enum(['upload', 'manual']),
  recordCount: z.number().int().nonnegative(), uniqueTextCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(), createdAt: z.iso.datetime({ offset: true }),
}).refine(batch => batch.uniqueTextCount <= batch.recordCount);
export const BatchesResponse = z.strictObject({
  data: z.strictObject({ items: z.array(PrivateBatch).max(100) }),
  meta: z.strictObject({ contractVersion: z.literal('batches-1.0.0'),
    page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(),
  }),
});
export type PrivateBatchType = z.infer<typeof PrivateBatch>;
