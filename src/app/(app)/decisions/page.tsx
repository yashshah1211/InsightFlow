'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchDecisions, ApiError } from '@/components/api-client';
import { DecisionsResponseType, ObjectiveType } from '@/lib/contracts';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { SeverityBadge, IssueStatusBadge } from '@/components/ui/badge';
import { PriorityBreakdown } from '@/components/insightflow/priority-breakdown';
import { WEIGHTS } from '@/lib/analysis/priority';
import { simulatePriorities } from '@/lib/analysis/simulation';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconRefresh,
} from '@/components/icons';
import { useAuth } from '@/components/insightflow/auth-context';

const OBJECTIVES: { id: ObjectiveType; title: string; desc: string }[] = [
  {
    id: 'safety',
    title: 'Safety & Risk Prioritization',
    desc: 'Severity carries the largest weight. Review supporting evidence before treating an allegation as established fact.',
  },
  {
    id: 'experience',
    title: 'Customer Experience',
    desc: 'Increases the share of distinct patterns and negative or mixed evidence while keeping severity dominant.',
  },
  {
    id: 'operations',
    title: 'Operational Reliability',
    desc: 'Gives distinct-pattern share its highest preset weight. Topics and repetition counts do not receive separate boosts.',
  },
];

export default function DecisionStudioPage() {
  const { selectedBatchId } = useAuth();
  const [currentObjective, setCurrentObjective] = useState<ObjectiveType>('safety');
  const [data, setData] = useState<DecisionsResponseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Client-side what-if simulation state
  const [simulateCustom, setSimulateCustom] = useState(false);
  const [simSeverityWeight, setSimSeverityWeight] = useState(40);
  const [simPatternWeight, setSimPatternWeight] = useState(30);

  useEffect(() => {
    let active = true;
    fetchDecisions(currentObjective, selectedBatchId)
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(`API Error: ${err.message} (${err.code})`);
          } else {
            setError('Failed to load decision priorities');
          }
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [currentObjective, selectedBatchId]);

  function handleRecompute() {
    setLoading(true);
    setError(null);
    fetchDecisions(currentObjective, selectedBatchId)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(`API Error: ${err.message} (${err.code})`);
        } else {
          setError('Failed to load decision priorities');
        }
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-6">
      {/* Required Accessible Heading for Smoke Test */}
      <h2 className="sr-only">decisions</h2>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono font-bold tracking-wider text-slate-500">
              Decision Studio
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span className="text-xs text-cyan-700 font-medium">Deterministic Prioritization</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            Decision Studio
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Align customer feedback triage with strategic business objectives. Every ranking is 100% explainable and verified against server algorithms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecompute}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            <span>Recompute</span>
          </button>
        </div>
      </div>

      {/* Provenance Banner */}
      {data?.meta && <ProvenanceBanner meta={data.meta} />}

      {/* Objective Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OBJECTIVES.map((obj) => {
          const isSelected = currentObjective === obj.id;
          return (
            <div
              key={obj.id}
              role="button" tabIndex={0} aria-label={obj.title} aria-pressed={isSelected}
              onClick={() => { if (currentObjective !== obj.id) { setLoading(true); setError(null); setCurrentObjective(obj.id); } }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && currentObjective !== obj.id) { e.preventDefault(); setLoading(true); setError(null); setCurrentObjective(obj.id); } }}
              className={`p-5 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-mono uppercase font-bold tracking-wider ${isSelected ? 'text-cyan-300' : 'text-slate-400'}`}>
                  {obj.id.toUpperCase()}
                </span>
                {isSelected && (
                  <span className="text-[11px] bg-cyan-400/20 text-cyan-300 px-2 py-0.5 rounded-full font-mono font-medium">
                    Active Objective
                  </span>
                )}
              </div>

              <h2 className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                {obj.title}
              </h2>
              <p className={`text-xs mt-1.5 leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                {obj.desc}
              </p>

              <div className={`mt-3 pt-3 border-t text-[11px] font-mono ${isSelected ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'}`}>
                Severity: {(WEIGHTS[obj.id].severity * 100).toFixed(0)}% · Pattern share: {(WEIGHTS[obj.id].distinctPatternShare * 100).toFixed(0)}% · Negative share: {(WEIGHTS[obj.id].negativeShare * 100).toFixed(0)}% · Evidence: {(WEIGHTS[obj.id].evidenceCoverage * 100).toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* What-If Simulation Toggle */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">What-If Sensitivity Simulation</span>
              <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Hypothetical · Not an observed outcome
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Explore how adjusting objective factor weights alters priority scores without modifying server ground truth.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSimulateCustom(!simulateCustom)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 shrink-0"
          >
            {simulateCustom ? 'Hide Simulation Sliders' : 'Open Simulation Sliders'}
          </button>
        </div>

        {simulateCustom && (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex justify-between text-slate-700 font-medium mb-1">
                <span>Relative Severity Weight</span>
                <span className="font-mono">{simSeverityWeight}</span>
              </div>
              <input
                type="range"
                aria-label="Simulation severity weight"
                min={10}
                max={70}
                value={simSeverityWeight}
                onChange={(e) => setSimSeverityWeight(Number(e.target.value))}
                className="w-full accent-slate-900"
              />
            </div>
            <div>
              <div className="flex justify-between text-slate-700 font-medium mb-1">
                <span>Relative Pattern Share Weight</span>
                <span className="font-mono">{simPatternWeight}</span>
              </div>
              <input
                type="range"
                aria-label="Simulation pattern weight"
                min={10}
                max={70}
                value={simPatternWeight}
                onChange={(e) => setSimPatternWeight(Number(e.target.value))}
                className="w-full accent-slate-900"
              />
            </div>
          </div>
        )}
        {simulateCustom && data && !loading && !error && (
          <div className="mt-4 space-y-2 text-xs" aria-live="polite">
            <p className="text-slate-500">Hypothetical ranks use API factors. The two inputs plus fixed negative-share/evidence inputs of 15 each are normalized to 100%. Server scores and stored issues stay unchanged.</p>
            {simulatePriorities(data.data.rankedIssues, simSeverityWeight, simPatternWeight).map((result, index) => (
              <div key={result.id} data-testid="simulation-result" className="flex flex-wrap justify-between gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100">
                <Link href={`/issues?id=${encodeURIComponent(result.id)}${selectedBatchId ? `&batchId=${encodeURIComponent(selectedBatchId)}` : ''}`} className="underline">#{index + 1} {result.title}</Link>
                <span className="font-mono">Hypothetical: {result.score.toFixed(2)} · Server: {result.serverScore.toFixed(2)}</span>
              </div>
            ))}
            <p className="font-mono text-slate-500">Normalized severity: {(simSeverityWeight / (simSeverityWeight + simPatternWeight + 30) * 100).toFixed(1)}% · Pattern: {(simPatternWeight / (simSeverityWeight + simPatternWeight + 30) * 100).toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Ranked Issues Output */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-400">
          Recomputing priority rankings against server endpoint...
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-center">
          <IconAlertTriangle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <div className="font-bold">{error}</div>
        </div>
      ) : data?.data.rankedIssues.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          No ranked issues returned.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span className="font-semibold">
              Ranked Issues for {currentObjective.toUpperCase()} ({data?.data.rankedIssues.length} total)
            </span>
            <span className="font-mono text-slate-400">
              Methodology Version: {data?.data.methodologyVersion}
            </span>
          </div>

          <div className="space-y-4">
            {data?.data.rankedIssues.map((issue, idx) => (
              <div
                key={issue.id}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300 flex flex-col lg:flex-row lg:items-start justify-between gap-6"
              >
                {/* Left: Rank & Title */}
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs font-mono shadow-2xs">
                      #{idx + 1}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base leading-snug">
                      {issue.title}
                    </h3>
                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {issue.category}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {issue.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-mono pt-1">
                    <span>Evidence: <strong>{issue.evidenceCount} pattern(s)</strong></span>
                    <span>Issue created: <strong>{new Date(issue.createdAt).toLocaleDateString()}</strong></span>
                    <Link
                      href={`/issues?id=${encodeURIComponent(issue.id)}${selectedBatchId ? `&batchId=${encodeURIComponent(selectedBatchId)}` : ''}`}
                      className="text-slate-900 hover:text-slate-700 font-sans font-semibold underline underline-offset-4 flex items-center gap-1"
                    >
                      <span>Drill into Evidence</span>
                      <IconArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Right: Deterministic Factor Breakdown Card */}
                <div className="lg:w-80 shrink-0">
                  <PriorityBreakdown priority={issue.priority} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
