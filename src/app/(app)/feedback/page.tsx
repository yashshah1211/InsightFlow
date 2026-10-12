'use client';

import React, { useEffect, useState } from 'react';
import { fetchFeedback, ApiError } from '@/components/api-client';
import { FeedbackResponseType, FeedbackRecordType, FeedbackPatternType, Category, Sentiment } from '@/lib/contracts';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { SentimentBadge, SeverityBadge, SourceBadge } from '@/components/ui/badge';
import { FeedbackDrawer } from '@/components/insightflow/feedback-drawer';
import { ManualFeedbackModal } from '@/components/insightflow/manual-feedback-modal';
import { CsvImportModal } from '@/components/insightflow/csv-import-modal';
import {
  IconSearch,
  IconFilter,
  IconPlus,
  IconUpload,
  IconChevronRight,
  IconAlertTriangle,
} from '@/components/icons';
import { z } from 'zod';
import { useAuth } from '@/components/insightflow/auth-context';

const CATEGORIES = ['Product Feedback', 'Customer Service', 'Fraud and Scam', 'Operational Issues'] as const;
const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed', 'unknown'] as const;

export default function FeedbackExplorerPage() {
  const { selectedBatchId } = useAuth();
  const [data, setData] = useState<FeedbackResponseType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [q, setQ] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<z.infer<typeof Category> | undefined>();
  const [selectedSentiment, setSelectedSentiment] = useState<z.infer<typeof Sentiment> | undefined>();
  const [view, setView] = useState<'records' | 'patterns'>('records');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Detail drawer & modal states
  const [selectedItem, setSelectedItem] = useState<FeedbackRecordType | FeedbackPatternType | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Reset page and selection when batch context changes
  const [prevBatchId, setPrevBatchId] = useState(selectedBatchId);
  if (prevBatchId !== selectedBatchId) {
    setPrevBatchId(selectedBatchId);
    setPage(1);
    setSelectedItem(null);
  }

  useEffect(() => {
    let active = true;
    fetchFeedback({
      batchId: selectedBatchId,
      q: searchQuery.trim(),
      category: selectedCategory,
      sentiment: selectedSentiment,
      view,
      page,
      pageSize,
    })
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
            setError('Failed to load feedback');
          }
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [searchQuery, selectedCategory, selectedSentiment, view, page, pageSize, selectedBatchId]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery === q && page === 1) { handleRefresh(); return; }
    setError(null);
    setPage(1);
    setLoading(true);
    setSearchQuery(q);
  }

  function handleRefresh() {
    setLoading(true);
    setError(null);
    fetchFeedback({
      batchId: selectedBatchId,
      q: searchQuery.trim(),
      category: selectedCategory,
      sentiment: selectedSentiment,
      view,
      page,
      pageSize,
    })
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(`API Error: ${err.message} (${err.code})`);
        } else {
          setError('Failed to load feedback');
        }
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-6">
      {/* Required Accessible Heading for Smoke Test */}
      <h2 className="sr-only">feedback</h2>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono font-bold tracking-wider text-slate-500">
              Explorer
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span className="text-xs text-indigo-700 font-medium">Verbatim Evidence</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">
            Feedback Explorer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search, filter, and inspect raw rows or distinct text patterns with exact occurrence counts. Filtered total: {data?.meta.total.toLocaleString() ?? 'pending'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>Add Record</span>
          </button>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs"
          >
            <IconUpload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
        </div>
      </div>

      {/* Provenance Banner */}
      {data?.meta && <ProvenanceBanner meta={data.meta} />}

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-4">
        {/* Row 1: View Toggle & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Segmented View Toggle: Records vs Patterns */}
          <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200/60 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setView('records');
                setPage(1);
                if (view !== 'records' || page !== 1) { setLoading(true); setError(null); }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                view === 'records'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Raw Records View
            </button>
            <button
              type="button"
              onClick={() => {
                setView('patterns');
                setPage(1);
                if (view !== 'patterns' || page !== 1) { setLoading(true); setError(null); }
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                view === 'patterns'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Distinct Patterns View
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md flex items-center gap-2">
            <div className="relative flex-1">
              <IconSearch className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search review text (case/space-insensitive)..."
                aria-label="Search review text"
                maxLength={200}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-900 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg border border-slate-200"
            >
              Search
            </button>
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setSearchQuery('');
                  setPage(1);
                  if (searchQuery || page !== 1) { setLoading(true); setError(null); }
                }}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Row 2: Category and Sentiment Selectors */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <IconFilter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Category Dropdown */}
          <select
            aria-label="Category filter"
            value={selectedCategory || ''}
            onChange={(e) => {
              setSelectedCategory((e.target.value as z.infer<typeof Category>) || undefined);
              setPage(1);
              setLoading(true); setError(null);
            }}
            className="rounded-lg border border-slate-300 py-1 px-2.5 text-xs text-slate-800 bg-white"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Sentiment Dropdown */}
          <select
            aria-label="Sentiment filter"
            value={selectedSentiment || ''}
            onChange={(e) => {
              setSelectedSentiment((e.target.value as z.infer<typeof Sentiment>) || undefined);
              setPage(1);
              setLoading(true); setError(null);
            }}
            className="rounded-lg border border-slate-300 py-1 px-2.5 text-xs text-slate-800 bg-white"
          >
            <option value="">All Sentiments</option>
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>

          {/* Page Size Dropdown */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-slate-500">Per page:</span>
            <select
              aria-label="Records per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
                setLoading(true); setError(null);
              }}
              className="rounded-lg border border-slate-300 py-1 px-2 text-xs text-slate-800 bg-white"
            >
              {[10, 20, 50, 100].map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Feedback List / Table */}
      {error ? (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-center">
          <IconAlertTriangle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <div className="font-bold">{error}</div>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-3 px-3 py-1 bg-rose-900 text-white rounded text-xs"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
          Loading feedback data...
        </div>
      ) : data?.data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
          <p className="text-sm font-semibold text-slate-800">No matching feedback found</p>
          <p className="mt-1">Try adjusting your search query or filter selections.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
          {/* Summary bar */}
          <div className="bg-slate-50/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing{' '}
              <strong className="text-slate-900 font-mono">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, data?.meta.total || 0)}
              </strong>{' '}
              of <strong className="text-slate-900 font-mono">{data?.meta.total.toLocaleString()}</strong> {view}
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              Page {data?.meta.page} of {data?.meta.totalPages}
            </div>
          </div>

          {/* List items */}
          <div className="divide-y divide-slate-100">
            {data?.data.items.map((item) => {
              if (item.kind === 'record') {
                return (
                  <div
                    key={item.id}
                    role="button" tabIndex={0} aria-label={`Inspect record ${item.rowNumber}`}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedItem(item); } }}
                    onClick={() => setSelectedItem(item)}
                    className="p-4 hover:bg-slate-50/80 cursor-pointer transition-colors flex items-start justify-between gap-4 group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          #{item.rowNumber}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {item.category}
                        </span>
                        <SourceBadge source={item.source} />
                        {item.annotation ? (
                          <>
                            <SentimentBadge sentiment={item.annotation.sentiment} />
                            <SeverityBadge severity={item.annotation.severity} />
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono italic">
                            Heuristic unassigned
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-800 font-mono leading-relaxed select-all line-clamp-2">
                        {item.rawText}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono pt-0.5">
                        <span className="truncate max-w-xs" title={item.normalizedHash}>
                          hash: {item.normalizedHash.slice(0, 16)}...
                        </span>
                        <span>•</span>
                        <span>Observed date: {item.observedAt ? new Date(item.observedAt).toLocaleDateString() : 'unavailable'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400 group-hover:text-slate-700 shrink-0 self-center">
                      <span className="text-xs font-medium hidden sm:inline">Inspect</span>
                      <IconChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              }

              // Pattern kind
              const pattern = item as FeedbackPatternType;
              return (
                <div
                  key={pattern.normalizedHash}
                  role="button" tabIndex={0} aria-label={`Inspect pattern ${pattern.normalizedHash.slice(0, 12)}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedItem(pattern); } }}
                  onClick={() => setSelectedItem(pattern)}
                  className="p-4 hover:bg-slate-50/80 cursor-pointer transition-colors flex items-start justify-between gap-4 group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-slate-900 text-white text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">
                        {pattern.occurrenceCount} occurrences
                      </span>
                      {pattern.annotation ? (
                        <>
                          <SentimentBadge sentiment={pattern.annotation.sentiment} />
                          <SeverityBadge severity={pattern.annotation.severity} />
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono italic">
                          Heuristic unassigned
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(pattern.categoryCounts)
                          .filter(([, cnt]) => cnt > 0)
                          .map(([cat, cnt]) => (
                            <span key={cat} className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">
                              {cat}: {cnt}
                            </span>
                          ))}
                      </div>
                    </div>

                    <p className="text-xs text-slate-900 font-mono font-medium leading-relaxed line-clamp-2">
                      &ldquo;{pattern.exampleOriginalText}&rdquo;
                    </p>

                    {pattern.annotation?.evidenceQuote && (
                      <div className="text-[11px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
                        Evidence quote: &ldquo;{pattern.annotation.evidenceQuote}&rdquo;
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 group-hover:text-slate-700 shrink-0 self-center">
                    <span className="text-xs font-medium hidden sm:inline">Details</span>
                    <IconChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {data && data.meta.totalPages > 1 && (
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => { setLoading(true); setError(null); setPage((p) => Math.max(1, p - 1)); }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <span className="text-slate-600 font-medium">
                Page {page} of {data.meta.totalPages}
              </span>

              <button
                type="button"
                disabled={page >= data.meta.totalPages}
                onClick={() => { setLoading(true); setError(null); setPage((p) => Math.min(data.meta.totalPages, p + 1)); }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      <FeedbackDrawer item={selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Action Modals */}
      <ManualFeedbackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        onSuccess={() => handleRefresh()}
      />
      <CsvImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => handleRefresh()}
      />
    </div>
  );
}
