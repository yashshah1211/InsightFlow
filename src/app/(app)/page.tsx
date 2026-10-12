'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchDashboard, ApiError } from '@/components/api-client';
import { DashboardResponseType } from '@/lib/contracts';
import { MetricCard } from '@/components/ui/metric-card';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { SeverityBadge, IssueStatusBadge } from '@/components/ui/badge';
import { SentimentBreakdown } from '@/components/insightflow/sentiment-breakdown';
import { CategoryBreakdown } from '@/components/insightflow/category-breakdown';
import {
  IconShield,
  IconAlertTriangle,
  IconArrowRight,
  IconRefresh,
  IconCheckCircle,
} from '@/components/icons';
import { useAuth } from '@/components/insightflow/auth-context';

export default function CommandCenterPage() {
  const { selectedBatchId } = useAuth();
  const [data, setData] = useState<DashboardResponseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDashboard(selectedBatchId)
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          if (err instanceof ApiError) {
            setError(`API Error: ${err.message} (${err.code})`);
          } else {
            setError('Failed to load dashboard data');
          }
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedBatchId]);

  function handleRefresh() {
    setLoading(true);
    setError(null);
    fetchDashboard(selectedBatchId)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(`API Error: ${err.message} (${err.code})`);
        } else {
          setError('Failed to load dashboard data');
        }
      })
      .finally(() => setLoading(false));
  }

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 bg-slate-200 rounded-lg" />
        <div className="h-16 w-full bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 max-w-xl mx-auto my-12 text-center">
        <IconAlertTriangle className="w-8 h-8 text-rose-600 mx-auto mb-2" />
        <h2 className="text-base font-bold">Failed to load Command Center</h2>
        <p className="text-xs text-rose-700 mt-1">{error || 'Unknown failure'}</p>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-rose-900 text-white text-xs font-semibold rounded-lg hover:bg-rose-800"
        >
          Retry
        </button>
      </div>
    );
  }

  const { summary, topIssues } = data.data;
  const repeatRatio = summary.recordCount > 0
    ? ((summary.repeatedRecordCount / summary.recordCount) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono font-bold tracking-wider text-slate-500">
              Executive Overview
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700 font-medium">Evidence Summary</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            InsightFlow foundation — Command Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Defensible customer feedback intelligence powered by exact deduplication and transparent heuristic evidence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Provenance & Limitations Banner */}
      <ProvenanceBanner meta={data.meta} />

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Raw Records"
          value={summary.recordCount}
          subtitle="All imported customer rows"
          hint="Preserved verbatim without lossy deletion"
        />
        <MetricCard
          title="Distinct Text Patterns"
          value={summary.uniqueTextCount}
          subtitle="Unique normalized text clusters"
          hint="Evaluated basis for all sentiment & issue scoring"
        />
        <MetricCard
          title="Exact Repeated Records"
          value={summary.repeatedRecordCount}
          subtitle={`${repeatRatio}% of batch are exact duplicates`}
          hint="Frequency counts rows, not distinct customers"
        />
        <MetricCard
          title="Annotation Coverage"
          value={summary.annotationCoverage.covered}
          subtitle={`${summary.annotationCoverage.ratio !== null ? (summary.annotationCoverage.ratio * 100).toFixed(1) : 0}% of distinct patterns analyzed`}
          hint="Rule-based heuristic-v2; unclassified remains unknown"
        />
      </div>

      {/* Honest Data Integrity & Unavailability Disclosures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Customer Complaint Timelines"
          value="Unavailable"
          isUnavailable={true}
          unavailableReason={summary.timeTrends.reason || 'Source CSV contains no complaint timestamps'}
          hint="Zero fabricated time trends. Import time is not event time."
        />
        <MetricCard
          title="Unique Customer Count"
          value="Unavailable"
          isUnavailable={true}
          unavailableReason={summary.uniqueCustomers.reason || 'Source CSV has no customer identifiers'}
          hint="Duplicated rows are not claimed as independent customers."
        />
      </div>

      {/* Deep Analytics Visualizations: Category & Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdown summary={summary} />
        <SentimentBreakdown summary={summary} />
      </div>

      {/* Priority Issues & TrustLens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Issues Strip */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                Top Priority Operational & Safety Issues
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic ranking from {topIssues.length} identified issue clusters
              </p>
            </div>
            <Link
              href="/issues"
              className="text-xs font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-1"
            >
              <span>View All Issues</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {topIssues.map((issue, idx) => (
              <div
                key={issue.id}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <h3 className="font-semibold text-slate-900 text-sm">{issue.title}</h3>
                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 max-w-xl">
                    {issue.summary}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono pt-1">
                    <span>Evidence: <strong>{issue.evidenceCount} pattern(s)</strong></span>
                    <span>Category: <strong>{issue.category}</strong></span>
                  </div>
                </div>

                <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <div className="text-right">
                    <div className="text-xs uppercase text-slate-500 font-medium">Priority</div>
                    <div className="text-xl font-bold font-mono text-slate-900">
                      {issue.priority.score.toFixed(1)}
                    </div>
                  </div>
                  <Link
                    href={`/issues?id=${encodeURIComponent(issue.id)}${selectedBatchId ? `&batchId=${encodeURIComponent(selectedBatchId)}` : ''}`}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs"
                  >
                    Examine Evidence
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TrustLens Data Integrity Panel */}
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <IconShield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">TrustLens Verification</h2>
                <p className="text-[11px] text-slate-400">Strict Data Integrity Protocol</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              InsightFlow enforces rigorous data hygiene to prevent misleading AI conclusions:
            </p>

            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <IconCheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Exact Hash Deduplication:</strong>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    {summary.uniqueTextCount} distinct strings normalized via whitespace collapse & case folding. Repeats counted without destructive deletion.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <IconCheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Negation Safety Rules:</strong>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Statements like &ldquo;not a victim of fraud&rdquo; are barred from becoming affirmative fraud findings.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <IconCheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">Dual-Aspect Nuance:</strong>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Mixed feedback captures both positive service and operational friction without collapsing into inaccurate averages.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
            Source: {data.meta.provenance.source} · Customer identities unavailable
          </div>
        </div>
      </div>
    </div>
  );
}
