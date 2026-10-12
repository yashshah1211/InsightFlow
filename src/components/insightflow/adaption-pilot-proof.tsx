import React from 'react';
import proof from '@/lib/analysis/adaption-public-proof.json';

/** Static audited aggregate release evidence, independent of the selected batch API. */
export function AdaptionPilotProof() {
  const rows = [
    ['Sentiment', proof.agreement.sentiment],
    ['Severity', proof.agreement.severity],
    ['Exact issue sets', proof.agreement.exactIssueSets],
  ] as const;
  return (
    <section aria-labelledby="completed-pilot-title" className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-xs space-y-4">
      <div>
        <h2 id="completed-pilot-title" className="text-base font-bold text-slate-900">Adaption Adaptive Data — Completed Synthetic Pilot</h2>
        <p className="text-xs text-slate-600 mt-1">Separate original synthetic pilot · status: {proof.status}. This pilot did not classify the selected batch, competition records or public demo fixtures.</p>
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {[
          ['Inputs', `${proof.counts.inputs}`], ['Actual outputs', `${proof.counts.outputs}`],
          ['Structural & evidence validation', `${proof.counts.structurallyValidated}/${proof.counts.outputs}`],
          ['Human-approved training candidates', `${proof.counts.humanApprovedCandidates}/${proof.counts.outputs}`],
        ].map(([label, value]) => <div key={label} className="p-3 bg-slate-50 rounded-lg border border-slate-200"><dt className="text-slate-600">{label}</dt><dd className="text-lg font-bold text-slate-900 mt-1">{value}</dd></div>)}
      </dl>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table aria-label="Independent synthetic pilot agreement" className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr><th className="p-3">Independent agreement</th><th className="p-3">Adaption candidates</th><th className="p-3">Existing heuristics</th></tr></thead>
          <tbody>{rows.map(([name, value]) => <tr key={name} className="border-t border-slate-200"><th scope="row" className="p-3 font-medium">{name}</th><td className="p-3">{value.candidate}/{value.denominator}</td><td className="p-3">{value.heuristic}/{value.denominator}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">Sentiment and severity agreement were higher; exact issue-set agreement was lower. Mixed-label agreement: {proof.agreement.mixedLabel.correct}/{proof.agreement.mixedLabel.denominator} known references (5 unknown flags excluded). Both polarities preserved: {proof.agreement.mixedAspectPreservation.preserved}/{proof.agreement.mixedAspectPreservation.denominator} mixed examples. Exact aspect-set agreement: {proof.agreement.exactAspectSets.correct}/{proof.agreement.exactAspectSets.denominator}.</p>
      <p className="text-xs text-slate-700"><strong>Provider grading declined: {proof.providerGrading.before.toFixed(1)} → {proof.providerGrading.after.toFixed(1)} ({proof.providerGrading.gradeBefore} → {proof.providerGrading.gradeAfter}).</strong> Provider dataset grading is separate from independent label agreement.</p>
      <p className="text-xs text-slate-700">Completed Adaptive Data processing and evaluation workflow; no deployed trained classifier. All 25 generated candidates await human review. Validation is not human approval or generalized model accuracy.</p>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-900">Actual run provenance and limitations</summary>
        <dl className="mt-3 space-y-2 break-all">
          <div><dt className="font-semibold">Dataset ID</dt><dd>{proof.datasetId}</dd></div>
          <div><dt className="font-semibold">Run ID</dt><dd>{proof.runId}</dd></div>
          <div><dt className="font-semibold">Submitted (UTC)</dt><dd>{proof.submittedAt}</dd></div>
          <div><dt className="font-semibold">First observed success (UTC)</dt><dd>{proof.firstObservedSucceededAt} · {proof.timestampMeaning}</dd></div>
          <div><dt className="font-semibold">Normalized output SHA-256</dt><dd>{proof.provenance.normalizedOutputSha256}</dd></div>
          <div><dt className="font-semibold">Importer version</dt><dd>{proof.provenance.mapperVersion} (not a trained model)</dd></div>
        </dl>
        <ul className="mt-3 list-disc pl-4 space-y-1">{proof.limitations.map(text => <li key={text}>{text}</li>)}</ul>
      </details>
    </section>
  );
}
