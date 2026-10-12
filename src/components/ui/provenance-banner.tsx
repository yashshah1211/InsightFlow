import React, { useState } from 'react';
import { MetaType } from '@/lib/contracts';
import { IconShield, IconAlertTriangle, IconInfo, IconChevronDown } from '../icons';

export function ProvenanceBanner({ meta }: { meta?: MetaType }) {
  const [expanded, setExpanded] = useState(false);

  if (!meta) return null;

  const isOfficial = meta.provenance.source === 'official_csv';
  const isFixture = meta.provenance.source === 'fixture';

  return (
    <div className="bg-slate-900 text-white rounded-xl border border-slate-800 shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${isOfficial ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
            {isOfficial ? <IconShield className="w-5 h-5" /> : <IconAlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white tracking-wide">
                {isOfficial ? 'Official CSV · Read-only artifact' : isFixture ? 'Development Fixture Active' : 'Private Database Snapshot'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
                isOfficial ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {meta.provenance.source}
              </span>
              <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                batch: {meta.batchId}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {meta.provenance.label} · Pipeline: {meta.provenance.methodologyVersion}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/80 transition-colors"
          >
            <IconInfo className="w-3.5 h-3.5 text-sky-400" />
            <span>{meta.limitations.length} Data Limitations</span>
            <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Strict Data Transparency & Integrity Disclosures:
          </div>
          <ul className="space-y-1.5 pl-4 list-disc text-slate-300">
            {meta.limitations.map((lim, idx) => (
              <li key={idx} className="leading-relaxed">
                {lim}
              </li>
            ))}
            <li className="leading-relaxed text-amber-300/90 font-mono">
              Import time is not a complaint date. Repetition counts rows, not independent customers.
            </li>
            <li className="leading-relaxed text-sky-300/90 font-mono">
              {isOfficial ? 'Storage: generated server artifact; this does not indicate live Supabase persistence.' : isFixture ? 'Storage: authored development samples; official dataset assertions do not apply.' : 'Storage: authenticated private Supabase batch; public demo data stays read-only.'}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
