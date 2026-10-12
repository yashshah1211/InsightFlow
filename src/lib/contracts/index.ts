import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0' as const;
export const Category = z.enum(['Product Feedback', 'Customer Service', 'Fraud and Scam', 'Operational Issues']);
export const Sentiment = z.enum(['positive', 'negative', 'neutral', 'mixed', 'unknown']);
export const Severity = z.enum(['low', 'medium', 'high', 'critical', 'unknown']);
export const Status = z.enum(['not_configured', 'pending', 'processing', 'partial', 'ready', 'failed']);
export const IssueStatus = z.enum(['open', 'investigating', 'planned', 'resolved']);
export const Objective = z.enum(['safety', 'experience', 'operations']);
export const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const Id = z.string().min(1).max(100);
export const Count = z.number().int().nonnegative();
export const Ratio = z.number().min(0).max(1);
export const DateTime = z.iso.datetime({ offset: true });
export const Coverage = z.object({ covered: Count, total: Count, ratio: Ratio.nullable(), basis: z.enum(['records', 'patterns']) });
export const UnavailableMetric = z.object({ status: z.literal('unavailable'), value: z.null(), reason: z.string() });
export const Meta = z.object({
  contractVersion: z.literal(CONTRACT_VERSION), mode: z.enum(['fixture', 'database']),
  batchId: Id, dataSourceStatus: Status, analysisStatus: Status,
  provenance: z.object({ source: z.enum(['fixture', 'official_csv', 'manual', 'upload']), label: z.string(), methodologyVersion: z.string() }),
  limitations: z.array(z.string()),
});
export const ErrorCode = z.enum(['INVALID_QUERY', 'INVALID_BODY', 'INVALID_CSV', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'NOT_IMPLEMENTED', 'NOT_CONFIGURED', 'INTERNAL_ERROR']);
export const ErrorResponse = z.object({ error: z.object({ code: ErrorCode, message: z.string() }) });
export const envelope = <T extends z.ZodType>(data: T) => z.object({ data, meta: Meta });
export const Annotation = z.object({
  sentiment: Sentiment, severity: Severity, issueTypes: z.array(z.string()),
  aspects: z.array(z.object({ topic: z.string(), sentiment: Sentiment, evidenceQuote: z.string() })),
  explanation: z.string(), evidenceQuote: z.string(), analyzedBy: z.enum(['heuristic', 'manual', 'adaption', 'other']),
  pipelineVersion: z.string(), reviewStatus: z.enum(['unreviewed', 'verified', 'rejected']), confidence: Ratio.nullable(),
});
export const FeedbackRecord = z.object({ kind: z.literal('record'), id: Id, batchId: Id, rowNumber: Count,
  rawText: z.string(), category: Category, normalizedHash: Hash,
  source: z.enum(['fixture', 'official_csv', 'manual', 'upload']), importedAt: DateTime,
  observedAt: DateTime.nullable(), annotation: Annotation.nullable(),
});
export const FeedbackPattern = z.object({ kind: z.literal('pattern'), batchId: Id, normalizedHash: Hash,
  normalizedText: z.string(), exampleOriginalText: z.string(), occurrenceCount: Count,
  categoryCounts: z.record(Category, Count), annotation: Annotation.nullable(),
});
export const FeedbackItem = z.discriminatedUnion('kind', [FeedbackRecord, FeedbackPattern]);
export const FeedbackQuery = z.strictObject({ batchId: Id.optional(), q: z.string().max(200).default(''),
  category: Category.optional(), sentiment: Sentiment.optional(), view: z.enum(['records', 'patterns']).default('records'),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const BatchQuery = z.strictObject({ batchId: Id.optional() });
export const FeedbackResponse = z.object({ data: z.object({ view: z.enum(['records', 'patterns']), items: z.array(FeedbackItem) }),
  meta: Meta.extend({ total: Count, page: Count, pageSize: Count, totalPages: Count }),
}).superRefine((value, ctx) => {
  const expected = value.data.view === 'records' ? 'record' : 'pattern';
  if (value.data.items.some(item => item.kind !== expected)) ctx.addIssue({ code: 'custom', message: 'Items must match view' });
});
export const PriorityFactors = z.object({ severity: Ratio, distinctPatternShare: Ratio, negativeShare: Ratio, evidenceCoverage: Ratio });
export const Priority = z.object({ score: z.number().min(0).max(100), objective: Objective, factors: PriorityFactors,
  weights: PriorityFactors, methodologyVersion: z.string(), rationale: z.string() });
export const Issue = z.object({ id: Id, title: z.string(), category: Category, severity: Severity,
  summary: z.string(), status: IssueStatus, notes: z.string(), evidenceCount: Count,
  createdAt: DateTime, updatedAt: DateTime, priority: Priority });
export const Recommendation = z.object({ description: z.string(), rationale: z.string(), source: z.enum(['template', 'manual', 'ai']) });
export const IssueEvidence = z.object({ role: z.enum(['supporting', 'contradicting', 'context']), pattern: FeedbackPattern, samples: z.array(FeedbackRecord) });
export const Action = z.object({ id: Id, issueId: Id, description: z.string(), status: z.enum(['todo', 'in_progress', 'done']), notes: z.string(), createdAt: DateTime, updatedAt: DateTime });
export const IssuesQuery = BatchQuery.extend({ status: IssueStatus.optional() });
export const IssuesResponse = envelope(z.object({ items: z.array(Issue) }));
export const IssueDetailResponse = envelope(z.object({ issue: Issue, evidence: z.array(IssueEvidence), recommendations: z.array(Recommendation), actions: z.array(Action) }));
export const IssuePatchRequest = z.strictObject({ status: IssueStatus.optional(), notes: z.string().max(4000).optional() }).refine(v => Object.keys(v).length > 0, 'At least one field required');
export const IssuePatchResponse = envelope(Issue);
export const ActionRequest = z.strictObject({ description: z.string().trim().min(1).max(2000), notes: z.string().max(4000).default('') });
export const ActionResponse = envelope(Action);
export const ManualFeedbackRequest = z.strictObject({ review: z.string().trim().min(1).max(10000), category: Category, observedAt: DateTime.nullable().default(null) });
export const ManualFeedbackResponse = envelope(FeedbackRecord);
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const ImportFileMetadata = z.strictObject({ filename: z.string().min(1).max(255).regex(/\.csv$/i),
  contentType: z.enum(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream', '']),
  size: z.number().int().min(1).max(MAX_CSV_BYTES), source: z.enum(['official_csv', 'upload']).default('upload') });
export const RejectedRow = z.object({ rowNumber: Count, reason: z.string() });
export const ImportResponse = envelope(z.object({ batchId: Id, recordCount: Count, uniqueTextCount: Count, repeatedRecordCount: Count,
  rejectedCount: Count, rejectedRows: z.array(RejectedRow), idempotentReplay: z.boolean() }));
export const Summary = z.object({ recordCount: Count, uniqueTextCount: Count, repeatedRecordCount: Count,
  categoryCounts: z.record(Category, Count), categoryPatternCounts: z.record(Category, Count),
  sentimentCounts: z.record(Sentiment, Count), sentimentBasis: z.literal('patterns'),
  annotationCoverage: Coverage, timestampCoverage: Coverage, uniqueCustomers: UnavailableMetric, timeTrends: UnavailableMetric });
export const DashboardResponse = envelope(z.object({ summary: Summary, topIssues: z.array(Issue) }));
export const DecisionsQuery = BatchQuery.extend({ objective: Objective.default('safety') });
export const DecisionsResponse = envelope(z.object({ objective: Objective, rankedIssues: z.array(Issue), methodologyVersion: z.string() }));
export const AdaptionRun = z.object({ id: Id, datasetId: z.string().nullable(), runId: z.string().nullable(), status: Status,
  sourceRows: Count, processedRows: Count.nullable(), estimatedCredits: z.number().nonnegative().nullable(),
  actualCredits: z.number().nonnegative().nullable(), artifactPath: z.string().nullable(), errorMessage: z.string().nullable() });
export const DataLabResponse = envelope(z.object({ summary: Summary, imports: z.array(z.object({ batchId: Id, filename: z.string(), source: z.string(), status: Status, createdAt: DateTime })),
  adaption: z.object({ status: Status, runs: z.array(AdaptionRun), evaluation: UnavailableMetric }),
  top20RecordCount: Count, officialDatasetAssertions: z.enum(['pending', 'passed', 'failed']) }));
export const ExportQuery = BatchQuery.extend({ format: z.literal('csv').default('csv') });
// Successful export is text/csv, not a JSON envelope. Errors use ErrorResponse.
export const ExportRow = z.object({ metric: z.string(), value: z.string(), basis: z.string(), source: z.string(), limitation: z.string() });
export type FeedbackRecordType = z.infer<typeof FeedbackRecord>;
export type FeedbackPatternType = z.infer<typeof FeedbackPattern>;
export type AnnotationType = z.infer<typeof Annotation>;
export type SummaryType = z.infer<typeof Summary>;
export type IssueType = z.infer<typeof Issue>;
export type MetaType = z.infer<typeof Meta>;
export type PriorityFactorsType = z.infer<typeof PriorityFactors>;
export type ObjectiveType = z.infer<typeof Objective>;
export type DashboardResponseType = z.infer<typeof DashboardResponse>;
export type FeedbackResponseType = z.infer<typeof FeedbackResponse>;
export type FeedbackQueryType = z.infer<typeof FeedbackQuery>;
export type ManualFeedbackRequestType = z.infer<typeof ManualFeedbackRequest>;
export type ImportResponseType = z.infer<typeof ImportResponse>;
export type IssueDetailResponseType = z.infer<typeof IssueDetailResponse>;
export type IssuesResponseType = z.infer<typeof IssuesResponse>;
export type IssuePatchRequestType = z.infer<typeof IssuePatchRequest>;
export type ActionRequestType = z.infer<typeof ActionRequest>;
export type ActionResponseType = z.infer<typeof ActionResponse>;
export type DecisionsResponseType = z.infer<typeof DecisionsResponse>;
export type DataLabResponseType = z.infer<typeof DataLabResponse>;
export type ErrorResponseType = z.infer<typeof ErrorResponse>;
