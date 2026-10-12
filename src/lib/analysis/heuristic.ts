import type { AnnotationType } from '@/lib/contracts';
export const METHODOLOGY_VERSION = 'heuristic-v2';
// Narrow, clause-scoped evidence rules. Unknown is preferable to unsupported inference.
const rules = [
  { topic: 'suspected_fraud', pattern: /\b(?:victim of fraud|fraudulent activity|scammed|unauthorized charge)\b/i, severity: 'critical' as const },
  { topic: 'delayed_delivery', pattern: /\b(?:delayed delivery|delivery(?: process)? was(?: slightly)? delayed|late delivery)\b/i, severity: 'medium' as const },
  { topic: 'defective_product', pattern: /\b(?:defective|broken product|some defects)\b/i, severity: 'high' as const },
  { topic: 'checkout_failure', pattern: /\b(?:checkout crashed|checkout crashes)\b/i, severity: 'high' as const },
  { topic: 'unresolved_service', pattern: /\b(?:support never responded|unresolved complaint)\b/i, severity: 'medium' as const },
];
const severityOrder = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
export function annotateHeuristically(text: string): AnnotationType {
  const aspects: AnnotationType['aspects'] = [];
  let severity: AnnotationType['severity'] = 'unknown';
  for (const clause of text.split(/[.!?;]|\bbut\b|\bhowever\b|\balthough\b|\band\b/i).map(s => s.trim()).filter(Boolean)) {
    for (const rule of rules) {
      const match = rule.pattern.exec(clause);
      if (!match) continue;
      const before = clause.slice(0, match.index);
      const negated = /\b(?:not|no|never|without|isn't|wasn't|didn't|haven't|hasn't)\b/i.test(before) || /\b(?:not detected|not found|did not occur)\b/i.test(clause.slice(match.index + match[0].length));
      if (negated) aspects.push({ topic: `${rule.topic}_denied`, sentiment: 'neutral', evidenceQuote: clause });
      else {
        aspects.push({ topic: rule.topic, sentiment: 'negative', evidenceQuote: clause });
        if (severityOrder[rule.severity] > severityOrder[severity]) severity = rule.severity;
      }
    }
    if (/\b(?:issues while placing my order|technical issues|operational issues|minor (?:operational )?issue)\b/i.test(clause) && !/\b(?:not|no|never|without)\b/i.test(clause) && !aspects.some(a => a.evidenceQuote === clause && a.sentiment === 'negative')) {
      aspects.push({ topic: 'reported_problem', sentiment: 'negative', evidenceQuote: clause });
    }
    if (/\b(?:helpful support|support(?: team)? was (?:very )?helpful|seller was responsive|support team was (?:very )?responsive|ordering process was smooth|product was worth it|informed promptly|kept me informed|provided regular updates|provided a satisfactory (?:solution|explanation)|quick to resolve|excellent|great|love)\b/i.test(clause) && !/\b(?:not|never|no|isn't|wasn't)\b/i.test(clause)) {
      aspects.push({ topic: 'positive_experience', sentiment: 'positive', evidenceQuote: clause });
    }
  }
  const negative = aspects.some(a => a.sentiment === 'negative');
  const positive = aspects.some(a => a.sentiment === 'positive');
  const sentiment = negative && positive ? 'mixed' : negative ? 'negative' : positive ? 'positive' : aspects.length ? 'neutral' : 'unknown';
  return { sentiment, severity, issueTypes: [...new Set(aspects.filter(a => a.sentiment === 'negative' && a.topic !== 'reported_problem').map(a => a.topic))], aspects,
    explanation: 'Narrow clause-based rules; unsupported language remains unknown. Negated allegations are excluded from issue evidence.',
    evidenceQuote: aspects[0]?.evidenceQuote ?? '', analyzedBy: 'heuristic', pipelineVersion: METHODOLOGY_VERSION, reviewStatus: 'unreviewed', confidence: null };
}
export function validateAnnotationEvidence(text: string, annotation: AnnotationType): boolean {
  return (!annotation.evidenceQuote || text.includes(annotation.evidenceQuote)) && annotation.aspects.every(a => text.includes(a.evidenceQuote));
}
