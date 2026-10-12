'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchDashboard } from '@/components/api-client';
import { DashboardResponseType } from '@/lib/contracts';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { SeverityBadge, IssueStatusBadge } from '@/components/ui/badge';
import {
  IconDownload,
  IconPrinter,
  IconAlertTriangle,
} from '@/components/icons';
import { useAuth } from '@/components/insightflow/auth-context';

interface CsvRow {
  metric: string;
  value: string;
  basis: string;
  source: string;
  limitation: string;
}

export default function ExecutiveReportsPage() {
  const { selectedBatchId } = useAuth();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [data, setData] = useState<DashboardResponseType | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
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
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load report data');
          setLoading(false);
        }
      });

    // 2. Load CSV export preview
    const exportPreviewUrl = selectedBatchId
      ? `/api/reports/export?format=csv&batchId=${encodeURIComponent(selectedBatchId)}`
      : '/api/reports/export?format=csv';

    fetch(exportPreviewUrl, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 401 && selectedBatchId) window.dispatchEvent(new Event('insightflow:session-expired'));
        if (!res.ok) throw new Error(`Export preview unavailable (${res.status})`);
        return res.text();
      })
      .then((csvText) => {
        if (!csvText) return;
        const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length <= 1) return;
        // Parse CSV preview rows
        const rows: CsvRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
          const match: string[] = [];
          let m: RegExpExecArray | null;
          while ((m = regex.exec(lines[i])) !== null) {
            match.push(m[1] !== undefined ? m[1].replace(/""/g, '"') : (m[2] ?? ''));
            if (match.length >= 5) break;
          }
          if (match.length >= 5) {
            rows.push({
              metric: match[0],
              value: match[1],
              basis: match[2],
              source: match[3],
              limitation: match[4],
            });
          }
        }
        if (active) setCsvPreview(rows);
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Export preview unavailable'); });

    return () => {
      active = false;
    };
  }, [selectedBatchId]);

  async function handleDownloadCsv() {
    setDownloading(true);
    try {
      const exportDownloadUrl = selectedBatchId
        ? `/api/reports/export?format=csv&batchId=${encodeURIComponent(selectedBatchId)}`
        : '/api/reports/export?format=csv';

      const res = await fetch(exportDownloadUrl, { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401 && selectedBatchId) window.dispatchEvent(new Event('insightflow:session-expired'));
      if (!res.ok) throw new Error('Failed to generate CSV export');
      const blob = await res.blob();
      if (!mounted.current) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `insightflow-executive-summary-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      if (mounted.current) alert(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      {/* Required Accessible Heading for Smoke Test */}
      <h2 className="sr-only">reports</h2>

      {/* Header (Hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono font-bold tracking-wider text-slate-500">
              Reporting
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-700 font-medium">Audit-Ready Export</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            Executive Reports & Defensible Export
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Formal business governance summary with transparent methodology and verified CSV metrics export.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || !data || csvPreview.length === 0 || !!error}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors"
          >
            <IconPrinter className="w-4 h-4" />
            <span>Print Report (PDF)</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
          >
            <IconDownload className="w-4 h-4" />
            <span>{downloading ? 'Downloading...' : 'Download CSV Export'}</span>
          </button>
        </div>
      </div>

      {/* Error / Loading State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
          <IconAlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()} className="ml-auto underline">Retry report</button>
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-400">
          Loading report data...
        </div>
      )}

      {/* Provenance Banner */}
      {data?.meta && <ProvenanceBanner meta={data.meta} />}

      {/* Printable Executive Document Sheet */}
      {data && !error && csvPreview.length > 0 && <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-8 shadow-sm space-y-8 print:p-0 print:border-none print:shadow-none">
        {/* Document Title Header */}
        <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400 font-semibold mb-1">
              Build Battle 2026 · {data.meta.provenance.source} Feedback Audit
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Executive Feedback Intelligence Briefing
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Generated: {new Date().toLocaleDateString()} · Data Mode: {data.meta.provenance.source}
            </p>
          </div>

          <div className="text-left sm:text-right font-mono text-xs text-slate-500">
            <div>Contract: v{data.meta.contractVersion}</div>
            <div className="break-all">Batch: {data.meta.batchId}</div>
          </div>
        </div>

        {/* Executive Summary Narrative */}
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            1. Executive Narrative & Findings
          </h3>
          <p>
            This report summarizes the selected batch: {data.meta.provenance.label}. InsightFlow preserves original rows and groups exact normalized text while exposing occurrence frequency.
          </p>
          <p>
            <strong>Key Data Quality Finding:</strong> This batch contains <strong>{data.data.summary.recordCount.toLocaleString()} raw rows</strong> and <strong>{data.data.summary.uniqueTextCount} distinct normalized text patterns</strong>. There are {data.data.summary.repeatedRecordCount.toLocaleString()} repeated rows. Repeat rows describe message frequencies, not independent customers. Source complaint-date coverage: {data.data.summary.timestampCoverage.covered} / {data.data.summary.timestampCoverage.total} records. {data.data.summary.uniqueCustomers.reason}. {data.data.summary.timeTrends.reason}.
          </p>
        </div>

        {/* Quantified Metrics Table (Directly matching CSV Export) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              2. Defensible Metrics Table (CSV Mirror)
            </h3>
            <span className="text-[11px] font-mono text-slate-400 no-print">
              Live export verification from GET /api/reports/export
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 font-mono text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Metric</th>
                  <th className="py-2.5 px-4">Value</th>
                  <th className="py-2.5 px-4">Basis</th>
                  <th className="py-2.5 px-4">Source Provenance</th>
                  <th className="py-2.5 px-4">Disclosed Limitation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {csvPreview.length > 0 ? (
                  csvPreview.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 font-semibold text-slate-900">{row.metric}</td>
                      <td className="py-2 px-4 font-bold text-slate-800">{row.value}</td>
                      <td className="py-2 px-4 text-slate-600">{row.basis}</td>
                      <td className="py-2 px-4 text-slate-600 text-[11px]">{row.source}</td>
                      <td className="py-2 px-4 text-slate-500 text-[11px] italic font-sans max-w-xs">{row.limitation}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 px-4 text-center text-slate-400">
                      Loading export table metrics...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Priority Issues Summary */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            3. Prioritized Risk & Operational Issues
          </h3>
          <div className="space-y-3">
            {data?.data.topIssues.map((issue, idx) => (
              <div key={issue.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-500">#{idx + 1}</span>
                    <Link href={`/issues?id=${encodeURIComponent(issue.id)}${selectedBatchId ? `&batchId=${encodeURIComponent(selectedBatchId)}` : ''}`} className="font-bold text-slate-900 text-sm underline">{issue.title} · View evidence</Link>
                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />
                  </div>
                  <span className="font-mono font-bold text-slate-900">
                    Priority Score: {issue.priority.score.toFixed(1)} / 100
                  </span>
                </div>
                <p className="text-slate-600">{issue.summary}</p>
                <div className="text-[11px] text-slate-500 font-mono">
                  Evidence: {issue.evidenceCount} pattern(s) · Category: {issue.category} · Status: {issue.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Methodology & Safety Governance Statement */}
        <div className="pt-6 border-t border-slate-200 text-xs text-slate-600 space-y-2">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            4. Methodology & Safety Disclosures
          </h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Heuristic Analysis (Pipeline v2):</strong> Sentiment and topic assignments are performed by deterministic clause rules. Negated statements (&ldquo;I was not a victim of fraud&rdquo;) do not support fraud issues.
            </li>
            <li>
              <strong>Complaint Dates:</strong> Import time is not event time. {data.data.summary.timeTrends.reason}.
            </li>
            <li>
              <strong>Analysis Provenance:</strong> {data.meta.provenance.methodologyVersion}. This report does not claim Adaption results; inspect Data Lab for actual stored run provenance.
            </li>
          </ul>
        </div>
      </div>}
    </div>
  );
}
