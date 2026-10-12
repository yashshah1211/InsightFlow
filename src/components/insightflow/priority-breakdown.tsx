import React from 'react';
import { Priority } from '@/lib/contracts';
import { z } from 'zod';

type PriorityType = z.infer<typeof Priority>;

export function PriorityBreakdown({ priority }: { priority: PriorityType }) {
  const { score, objective, factors, weights, methodologyVersion, rationale } = priority;

  const factorItems = [
    { key: 'severity', label: 'Severity Rating', factor: factors.severity, weight: weights.severity, color: 'bg-rose-500' },
    { key: 'distinctPatternShare', label: 'Distinct Pattern Share', factor: factors.distinctPatternShare, weight: weights.distinctPatternShare, color: 'bg-indigo-500' },
    { key: 'negativeShare', label: 'Negative / Mixed Share', factor: factors.negativeShare, weight: weights.negativeShare, color: 'bg-amber-500' },
    { key: 'evidenceCoverage', label: 'Evidence Coverage', factor: factors.evidenceCoverage, weight: weights.evidenceCoverage, color: 'bg-emerald-500' },
  ];

  return (
    <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200">
        <div>
          <span className="font-semibold text-slate-900 uppercase tracking-wide text-[11px]">
            Priority Score ({objective} objective)
          </span>
          <span className="text-[11px] text-slate-500 ml-2 font-mono">v{methodologyVersion}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-2xl font-bold text-slate-900">{score.toFixed(1)}</span>
          <span className="text-slate-400 text-xs">/ 100</span>
        </div>
      </div>

      <p className="text-slate-600 mb-3 leading-relaxed italic bg-white p-2 rounded-md border border-slate-200/60">
        &ldquo;{rationale}&rdquo;
      </p>

      <div className="space-y-2.5">
        {factorItems.map((item) => (
          <div key={item.key}>
            <div className="flex justify-between text-[11px] text-slate-700 mb-1">
              <span className="font-medium">{item.label}</span>
              <span className="font-mono text-slate-600">
                Score: <strong>{(item.factor * 100).toFixed(1)}%</strong> · Weight: <strong>{(item.weight * 100).toFixed(0)}%</strong>
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${item.color} rounded-full transition-all duration-300`}
                style={{ width: `${Math.min(100, item.factor * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
