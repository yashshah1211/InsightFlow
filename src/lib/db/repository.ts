import type { FeedbackRecordType, FeedbackPatternType, MetaType, IssueType, ActionResponseType } from '@/lib/contracts';
import type { z } from 'zod';
import type { AdaptionRun } from '@/lib/contracts';
export interface FeedbackSnapshot {
  records: FeedbackRecordType[];
  patterns: FeedbackPatternType[];
  meta: MetaType;
  issues?: IssueType[];
  actions?: ActionResponseType['data'][];
  analysisCreatedAt?: string;
  adaptionRuns?: z.infer<typeof AdaptionRun>[];
}
// Phase 2 adapters receive a verified owner/session scope server-side. Never accept an owner ID from request JSON.
export interface FeedbackRepository { snapshot(batchId?: string): Promise<FeedbackSnapshot | null> }
