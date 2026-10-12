import { z } from 'zod';
import { FeedbackRecord, Hash, DateTime, Meta } from '@/lib/contracts';
export const OfficialArtifact = z.object({
  artifactVersion: z.literal(1), sourceUrl: z.string().url(), sourceSha256: Hash, generatedAt: DateTime,
  records: z.array(FeedbackRecord), meta: Meta,
});
