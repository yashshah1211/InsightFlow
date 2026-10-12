import type { AnnotationType } from '@/lib/contracts';
// Interface only: no network client or job submission implementation in Phase 1.
export interface AdaptionArtifactImporter {
  validateArtifact(input: { localPath: string; datasetId: string; runId: string; pipelineVersion: string }): Promise<{
    annotations: { normalizedHash: string; annotation: AnnotationType }[];
    rejectedRows: number;
  }>;
}
export interface ApprovedAdaptionPilot {
  maxRows: number;
  configurationHash: string;
  quotedCredits: number;
  approvedCredits: number;
  approvedAt: string;
}
