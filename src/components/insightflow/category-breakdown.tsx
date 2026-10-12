import React from 'react';
import { SummaryType } from '@/lib/contracts';

export function CategoryBreakdown({ summary }: { summary: SummaryType }) {
  const { categoryCounts, categoryPatternCounts, recordCount, uniqueTextCount } = summary;

  const categories = [
    { key: 'Product Feedback', label: 'Product Feedback', raw: categoryCounts['Product Feedback'] || 0, patterns: categoryPatternCounts['Product Feedback'] || 0, color: 'bg-sky-500' },
    { key: 'Customer Service', label: 'Customer Service', raw: categoryCounts['Customer Service'] || 0, patterns: categoryPatternCounts['Customer Service'] || 0, color: 'bg-teal-500' },
    { key: 'Fraud and Scam', label: 'Fraud and Scam', raw: categoryCounts['Fraud and Scam'] || 0, patterns: categoryPatternCounts['Fraud and Scam'] || 0, color: 'bg-rose-500' },
    { key: 'Operational Issues', label: 'Operational Issues', raw: categoryCounts['Operational Issues'] || 0, patterns: categoryPatternCounts['Operational Issues'] || 0, color: 'bg-amber-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Category Composition: Raw Rows vs Distinct Patterns</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Exposing repetition density across the {recordCount.toLocaleString()} raw rows and {uniqueTextCount.toLocaleString()} distinct patterns
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((cat) => {
          const rawPct = recordCount > 0 ? ((cat.raw / recordCount) * 100).toFixed(1) : '0';
          const patternPct = uniqueTextCount > 0 ? ((cat.patterns / uniqueTextCount) * 100).toFixed(1) : '0';
          const repeatRatio = cat.patterns > 0 ? (cat.raw / cat.patterns).toFixed(1) : '1';

          return (
            <div key={cat.key} className="p-3 rounded-lg bg-slate-50/70 border border-slate-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-slate-800">{cat.label}</span>
                <span className="text-slate-500 font-mono text-[11px]">
                  Avg repetition: <strong className="text-slate-900">{repeatRatio}×</strong> per pattern
                </span>
              </div>

              {/* Dual bar comparison */}
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                    <span>Raw Records</span>
                    <span className="font-mono font-medium">{cat.raw.toLocaleString()} rows ({rawPct}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${cat.color} opacity-80 rounded-full transition-all duration-300`}
                      style={{ width: `${Math.min(100, (cat.raw / (recordCount / 2)) * 50)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-600 mb-0.5">
                    <span>Distinct Patterns</span>
                    <span className="font-mono font-medium">{cat.patterns.toLocaleString()} patterns ({patternPct}%)</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (cat.patterns / (uniqueTextCount / 2)) * 50)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
