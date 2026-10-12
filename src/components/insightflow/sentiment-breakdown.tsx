import React from 'react';
import { SummaryType } from '@/lib/contracts';
import { IconInfo } from '../icons';

export function SentimentBreakdown({ summary }: { summary: SummaryType }) {
  const { sentimentCounts, annotationCoverage } = summary;
  const totalPatterns = summary.uniqueTextCount || 1;

  const segments = [
    { key: 'positive', label: 'Positive', count: sentimentCounts.positive, color: 'bg-emerald-500', text: 'text-emerald-700' },
    { key: 'negative', label: 'Negative', count: sentimentCounts.negative, color: 'bg-rose-500', text: 'text-rose-700' },
    { key: 'mixed', label: 'Mixed (Nuanced)', count: sentimentCounts.mixed, color: 'bg-purple-500', text: 'text-purple-700' },
    { key: 'neutral', label: 'Neutral', count: sentimentCounts.neutral, color: 'bg-slate-400', text: 'text-slate-700' },
    { key: 'unknown', label: 'Unknown (Heuristic unassigned)', count: sentimentCounts.unknown, color: 'bg-slate-200', text: 'text-slate-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Sentiment Distribution & Heuristic Coverage</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluated on distinct text patterns (basis: {summary.sentimentBasis})
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-slate-700">
            {annotationCoverage.covered} / {annotationCoverage.total} patterns
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {annotationCoverage.ratio !== null ? `${(annotationCoverage.ratio * 100).toFixed(1)}% analyzed` : '0%'}
          </div>
        </div>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex my-3">
        {segments.map((seg) => {
          const pct = (seg.count / totalPatterns) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              style={{ width: `${pct}%` }}
              className={`${seg.color} transition-all duration-300 relative group`}
              title={`${seg.label}: ${seg.count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend & Exact Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4 pt-3 border-t border-slate-100 text-xs">
        {segments.map((seg) => {
          const pct = ((seg.count / totalPatterns) * 100).toFixed(1);
          return (
            <div key={seg.key} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${seg.color}`} />
              <div className="min-w-0">
                <span className="font-medium text-slate-700">{seg.label}: </span>
                <span className="font-mono font-semibold text-slate-900">{seg.count}</span>
                <span className="text-slate-400 font-mono text-[11px] ml-1">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-2 text-[11px] text-slate-600">
        <IconInfo className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <span>
          <strong>Methodology Note:</strong> Analyzed by rule-based heuristic-v2. Mixed sentiment retains separate positive and problem clauses. Unsupported language defaults to unknown without forced hallucinations.
        </span>
      </div>
    </div>
  );
}
