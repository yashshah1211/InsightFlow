import React from 'react';
import { FeedbackRecordType, FeedbackPatternType } from '@/lib/contracts';
import { SentimentBadge, SeverityBadge, SourceBadge } from '../ui/badge';
import { IconClose, IconShield } from '../icons';

interface FeedbackDrawerProps {
  item: FeedbackRecordType | FeedbackPatternType | null;
  onClose: () => void;
}

export function FeedbackDrawer({ item, onClose }: FeedbackDrawerProps) {
  if (!item) return null;

  const isPattern = item.kind === 'pattern';
  const annotation = item.annotation;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div role="dialog" aria-modal="true" aria-label="Feedback evidence" className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500 font-mono">
                {isPattern ? 'Normalized Pattern View' : 'Raw Feedback Record'}
              </span>
              {isPattern ? (
                <span className="bg-slate-900 text-white text-[11px] px-2 py-0.5 rounded-full font-mono font-medium">
                  {item.occurrenceCount} occurrences
                </span>
              ) : (
                <SourceBadge source={item.source} />
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {isPattern ? 'Distinct Text Pattern' : `Record #${item.rowNumber}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close detail drawer"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 text-sm">
          {/* Verbatim Text */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-2">
              Verbatim Text
            </label>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-slate-900 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap select-all">
              {isPattern ? item.exampleOriginalText : item.rawText}
            </div>
          </div>

          {/* Metadata Card */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
            <div>
              <span className="text-slate-500 block">Category</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {isPattern ? Object.keys(item.categoryCounts).filter(k => item.categoryCounts[k as keyof typeof item.categoryCounts] > 0).join(', ') : item.category}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Batch ID</span>
              <span className="font-mono font-medium text-slate-900 mt-0.5 block truncate">
                {item.batchId}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500 block">SHA-256 Normalized Hash</span>
              <span className="font-mono text-[11px] text-slate-700 bg-white p-1.5 rounded-md border border-slate-200 block truncate mt-1 select-all">
                {item.normalizedHash}
              </span>
            </div>
            {!isPattern && (
              <>
                <div>
                  <span className="text-slate-500 block">Imported At</span>
                  <span className="font-mono text-slate-700 mt-0.5 block">
                    {new Date(item.importedAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer Event Date</span>
                  <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[11px] block mt-0.5">
                    {item.observedAt ? new Date(item.observedAt).toLocaleString() : 'Unavailable (null)'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* AI / Heuristic Annotation */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Rule-Based Annotation
              </label>
              {annotation ? (
                <div className="flex items-center gap-2">
                  <SentimentBadge sentiment={annotation.sentiment} />
                  <SeverityBadge severity={annotation.severity} />
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic">No annotation</span>
              )}
            </div>

            {annotation ? (
              <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-white">
                <div>
                  <span className="text-xs text-slate-500 font-medium block mb-1">Extracted Evidence Quote</span>
                  <blockquote className="p-3 bg-slate-50 rounded-lg border-l-4 border-slate-900 font-serif italic text-slate-800 text-xs">
                    &ldquo;{annotation.evidenceQuote}&rdquo;
                  </blockquote>
                </div>

                {annotation.aspects && annotation.aspects.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-500 font-medium block mb-1.5">Aspect Breakdown</span>
                    <div className="space-y-1.5">
                      {annotation.aspects.map((aspect, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs flex items-start justify-between gap-2 border border-slate-100">
                          <div>
                            <span className="font-semibold text-slate-900">{aspect.topic}</span>
                            <div className="text-slate-600 font-mono text-[11px] mt-0.5 italic">
                              &ldquo;{aspect.evidenceQuote}&rdquo;
                            </div>
                          </div>
                          <SentimentBadge sentiment={aspect.sentiment} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-xs text-slate-500 font-medium block mb-1">Explanation</span>
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {annotation.explanation}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>
                    <span>Pipeline:</span> <strong className="text-slate-700 font-mono">{annotation.pipelineVersion}</strong>
                  </div>
                  <div>
                    <span>Analyzed by:</span> <strong className="text-slate-700">{annotation.analyzedBy}</strong>
                  </div>
                  <div>
                    <span>Review status:</span> <strong className="text-slate-700">{annotation.reviewStatus}</strong>
                  </div>
                  <div>
                    <span>Confidence:</span> <span className="text-slate-600 italic">{annotation.confidence === null ? 'Unavailable (uncalibrated)' : annotation.confidence}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center">
                This item has not matched any specific negative issue rule.
              </div>
            )}
          </div>

          {/* Truthful Data Integrity Notice */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-600">
            <IconShield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900">Provenance Guaranteed:</strong>
              <p className="mt-0.5 leading-relaxed">
                Raw texts and repeat frequencies are preserved exactly as imported. Repeated rows are counted towards occurrence frequencies without fabricating individual customer identities.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
