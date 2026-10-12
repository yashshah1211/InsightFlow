import type { IssueType, ObjectiveType, FeedbackPatternType } from '@/lib/contracts';
import { computePriority } from './priority';
const topics = [
  { key: 'suspected_fraud', title: 'Suspected fraudulent activity', category: 'Fraud and Scam', severity: 'critical', factor: 1, recommendation: 'Review the cited transaction allegation and payment controls; verify before escalation.' },
  { key: 'defective_product', title: 'Defective product', category: 'Product Feedback', severity: 'high', factor: .75, recommendation: 'Inspect the reported defect and offer a documented replacement or repair process.' },
  { key: 'checkout_failure', title: 'Checkout failure', category: 'Operational Issues', severity: 'high', factor: .75, recommendation: 'Reproduce the cited checkout failure and inspect application errors.' },
  { key: 'delayed_delivery', title: 'Delayed delivery', category: 'Operational Issues', severity: 'medium', factor: .5, recommendation: 'Trace the cited delivery delay and communicate shipment status.' },
  { key: 'unresolved_service', title: 'Unresolved customer service', category: 'Customer Service', severity: 'medium', factor: .5, recommendation: 'Review the cited unanswered case and assign a response owner.' },
] as const;
export function evidencePatterns(patterns: FeedbackPatternType[], id: string) { return patterns.filter(p => p.annotation?.issueTypes.includes(id)); }
export function buildIssues(patterns: FeedbackPatternType[], objective: ObjectiveType = 'safety'): IssueType[] {
  return topics.flatMap(topic => {
    const evidence = evidencePatterns(patterns, topic.key);
    if (!evidence.length) return [];
    return [{ id: topic.key, title: topic.title, category: topic.category, severity: topic.severity,
      summary: `Rule-based finding supported by ${evidence.length} distinct text pattern(s); verify against original evidence.`,
      status: 'open' as const, notes: '', evidenceCount: evidence.length,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      priority: computePriority({ severity: topic.factor, distinctPatternShare: patterns.length ? evidence.length / patterns.length : 0,
        negativeShare: evidence.filter(p => ['negative', 'mixed'].includes(p.annotation?.sentiment ?? '')).length / evidence.length,
        evidenceCoverage: evidence.filter(p => p.annotation?.aspects.some(a => a.topic === topic.key && p.exampleOriginalText.includes(a.evidenceQuote))).length / evidence.length }, objective),
    }];
  }).sort((a, b) => b.priority.score - a.priority.score || a.id.localeCompare(b.id));
}
export function recommendations(id: string) {
  const topic = topics.find(t => t.key === id);
  return topic ? [{ description: topic.recommendation, rationale: 'Deterministic template attached to the supported issue topic; does not promise an outcome.', source: 'template' as const }] : [];
}
