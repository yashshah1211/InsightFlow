import { describe, it, expect } from 'vitest';
import { mapProviderOutput, ADAPTION_MAPPER_VERSION } from '@/lib/analysis/provider-output';

// Authored test doubles only; no real pilot, gold labels or provider evidence.
const hash = 'a'.repeat(64);
const review = 'Test-only feedback: the dial works, but its hinge slips.';
const sources = [{ normalized_hash: hash, review }];
const annotation = { sentiment: 'mixed', severity: 'unknown', issueTypes: ['test_hinge'],
  aspects: [{ topic: 'test_hinge', sentiment: 'negative', evidenceQuote: 'its hinge slips' }],
  explanation: 'Authored test-only candidate.', evidenceQuote: 'its hinge slips',
  analyzedBy: 'manual', pipelineVersion: 'untrusted-test-version', reviewStatus: 'unreviewed', confidence: null };
const row = () => ({ enhanced_prompt: null, enhanced_completion: JSON.stringify(annotation), normalized_hash: hash,
  original_context: review, review });

describe('inspected provider export mapper', () => {
  it('preserves labels and evidence while assigning real importer provenance', () => {
    const result = mapProviderOutput([row()], sources);
    expect(result.rejected).toEqual([]);
    expect(result.rows[0].annotation).toEqual({ ...annotation, analyzedBy: 'adaption', pipelineVersion: ADAPTION_MAPPER_VERSION });
    expect(result.audit.humanApprovalsCreated).toBe(0);
    expect(result.audit.classificationFieldsChanged).toBe(false);
  });
  it('accepts only a whole JSON fence and refuses prose or malformed JSON', () => {
    const wrapped = { ...row(), enhanced_completion: '```json\n' + JSON.stringify(annotation) + '\n```' };
    expect(mapProviderOutput([wrapped], sources).audit.fencedJsonRows).toBe(1);
    expect(mapProviderOutput([{ ...wrapped, enhanced_completion: wrapped.enhanced_completion + '\nExplanation' }], sources).rows).toEqual([]);
    expect(mapProviderOutput([{ ...row(), enhanced_completion: '{invalid' }], sources).rows).toEqual([]);
  });
  it('rejects duplicates, altered source text, unexpected columns and invented confidence', () => {
    expect(mapProviderOutput([row(), row()], sources).rejected).toHaveLength(1);
    for (const changed of [{ ...row(), review: 'altered' }, { ...row(), extraColumn: true },
      { ...row(), enhanced_completion: JSON.stringify({ ...annotation, confidence: 0.99 }) }]) {
      expect(mapProviderOutput([changed], sources).rows).toEqual([]);
    }
  });
  it('never trusts a provider claim of human review', () => {
    const result = mapProviderOutput([{ ...row(), enhanced_completion: JSON.stringify({ ...annotation, reviewStatus: 'verified' }) }], sources);
    expect(result.rows[0].annotation.reviewStatus).toBe('unreviewed');
    expect(result.audit.untrustedReviewClaims).toBe(1);
  });
});
