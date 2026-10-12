import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Annotation, Sentiment, Severity, DateTime, Hash } from '@/lib/contracts';
import { annotateHeuristically } from './heuristic';
import type { AdaptedRow } from './artifact-validation';

type Candidate = z.infer<typeof AdaptedRow>;
const Gold = z.object({ normalized_hash: Hash, review: z.string(), gold_sentiment: Sentiment, gold_severity: Severity,
  gold_issue_types: z.string(), review_status: z.literal('verified') });
export const CompletionReview = z.strictObject({ normalizedHash: Hash, candidateSha256: Hash,
  reviewer: z.string().trim().min(1), reviewedAt: DateTime, status: z.literal('verified') });
export const candidateSha256 = (annotation: z.infer<typeof Annotation>) => createHash('sha256').update(JSON.stringify(annotation)).digest('hex');

// Human gold is independent of generated candidates. Never fill gold from heuristics/provider output.
export function compareTrainingCandidates(candidates: Candidate[], sources: { normalized_hash: string; review: string }[], goldRows: unknown[]) {
  const sourcesByHash = new Map(sources.map(row => [row.normalized_hash, row.review]));
  const gold = goldRows.filter(row => (row as { review_status?: string }).review_status === 'verified').map(row => Gold.parse(row));
  if (new Set(gold.map(row => row.normalized_hash)).size !== gold.length) throw new Error('Duplicate gold pattern');
  const candidateMap = new Map(candidates.map(row => [row.normalizedHash, row.annotation]));
  const pairs = gold.map(row => {
    const source = sourcesByHash.get(row.normalized_hash);
    if (source !== row.review || !source) throw new Error('Gold review must match the exact source pattern');
    const topics = z.array(z.string().min(1)).parse(JSON.parse(row.gold_issue_types));
    return { gold: row, topics, baseline: annotateHeuristically(source), candidate: candidateMap.get(row.normalized_hash) };
  }).filter(pair => pair.candidate);
  const topicKey = (topics: string[]) => JSON.stringify([...new Set(topics)].sort());
  function score(which: 'candidate' | 'baseline') {
    const correct = { sentiment: 0, severity: 0, topics: 0 };
    for (const pair of pairs) {
      const annotation = pair[which]!;
      correct.sentiment += Number(annotation.sentiment === pair.gold.gold_sentiment);
      correct.severity += Number(annotation.severity === pair.gold.gold_severity);
      correct.topics += Number(topicKey(annotation.issueTypes) === topicKey(pair.topics));
    }
    return { correct, accuracy: Object.fromEntries(Object.entries(correct).map(([key, count]) => [key, pairs.length ? count / pairs.length : null])) };
  }
  return { verifiedGoldRows: gold.length, pairedDenominator: pairs.length, missingCandidateGoldRows: gold.length - pairs.length,
    candidate: score('candidate'), heuristicBaseline: score('baseline'),
    limitation: 'Paired pilot agreement with independent gold, not held-out classifier performance or Adaption quality grades' };
}

export function approvedTrainingRows(candidates: Candidate[], sources: { normalized_hash: string; review: string }[], approvals: unknown[]) {
  const parsed = approvals.map(row => CompletionReview.parse(row));
  if (new Set(parsed.map(row => row.normalizedHash)).size !== parsed.length) throw new Error('Duplicate completion approval');
  const byHash = new Map(candidates.map(row => [row.normalizedHash, row]));
  return parsed.map(approval => {
    const candidate = byHash.get(approval.normalizedHash);
    const source = sources.find(row => row.normalized_hash === approval.normalizedHash);
    if (!candidate || !source || candidateSha256(candidate.annotation) !== approval.candidateSha256) throw new Error('Completion approval is stale or outside validated candidates');
    return { prompt: 'Analyze the supplied customer review with exact evidence and preserved negation.', context: source.review,
      completion: candidate.annotation, sourcePatternHash: approval.normalizedHash, completionReview: approval,
      purpose: 'Human-reviewed instruction training example; no online classification or automatic analytics activation' };
  });
}
