import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import proof from '../src/lib/analysis/adaption-public-proof.json';
import { PublicPilotProof } from '../src/lib/analysis/public-pilot-proof';
import { AdaptionPilotProof } from '../src/components/insightflow/adaption-pilot-proof';

describe('sanitized completed pilot proof', () => {
  it('rejects source text, gold labels, billing and nested secret additions', () => {
    for (const key of ['review', 'enhanced_completion', 'humanReview', 'accountBalance', 'apiKey']) {
      expect(PublicPilotProof.safeParse({ ...proof, [key]: 'restricted' }).success).toBe(false);
    }
    expect(PublicPilotProof.safeParse({ ...proof, provenance: { ...proof.provenance, token: 'restricted' } }).success).toBe(false);
  });
  it('rejects invented approvals and mismatched run or comparison provenance', () => {
    expect(PublicPilotProof.safeParse({ ...proof, counts: { ...proof.counts, humanApprovedCandidates: 25 } }).success).toBe(false);
    expect(PublicPilotProof.safeParse({ ...proof, datasetId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
    expect(PublicPilotProof.safeParse({ ...proof, agreement: { ...proof.agreement, severity: { candidate: 26, heuristic: 2, denominator: 25 } } }).success).toBe(false);
  });
  it('shows completed processing alongside weaker results, unreviewed status and batch separation', () => {
    PublicPilotProof.parse(proof);
    const html = renderToStaticMarkup(createElement(AdaptionPilotProof));
    for (const text of ['Completed Synthetic Pilot', 'status: succeeded', '25/25', '0/25', '16/25', '2/25', '6/25', '9/25',
      '10.0 → 9.2', 'All 25 generated candidates await human review', 'no deployed trained classifier',
      'did not classify the selected batch', proof.runId]) expect(html).toContain(text);
  });
});
