'use client';

import React, { useState } from 'react';
import { submitManualFeedback, ApiError } from '../api-client';
import { useAuth } from './auth-context';
import { IconClose, IconAlertTriangle, IconCheckCircle, IconLock } from '../icons';

const CATEGORIES = ['Product Feedback', 'Customer Service', 'Fraud and Scam', 'Operational Issues'] as const;

export function ManualFeedbackModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { user, openSignInModal, selectWrittenBatch } = useAuth();
  const [review, setReview] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('Product Feedback');
  const [observedAt, setObservedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; isAuth?: boolean } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await submitManualFeedback(
        review.trim(),
        category,
        observedAt ? new Date(observedAt).toISOString() : null
      );
      const batchId = res.data.batchId;
      await selectWrittenBatch(batchId);

      setSuccess(`Record created and added to batch ${batchId || 'session'}`);
      setReview('');
      setObservedAt('');
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError({
          code: err.code,
          message: err.message,
          isAuth: err.statusCode === 401 || err.code === 'UNAUTHENTICATED',
        });
      } else {
        setError({
          code: 'CLIENT_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error occurred',
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add manual feedback"
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Add Manual Feedback</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit single record to private authenticated storage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual feedback"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {!user && (
            <div className="p-3.5 rounded-xl border bg-amber-50/80 border-amber-300 text-amber-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <IconLock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-950">
                    Public Demonstration Mode
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Writing feedback records requires an authenticated session and configured database persistence.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openSignInModal()}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] transition-colors"
              >
                Sign In
              </button>
            </div>
          )}

          {error && (
            <div
              className={`p-4 rounded-xl border text-xs leading-relaxed ${
                error.isAuth
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <IconAlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold">
                    {error.isAuth
                      ? '401 UNAUTHENTICATED — Authenticated Storage Required'
                      : error.code}
                  </div>
                  <p className="mt-1 font-medium">{error.message}</p>
                  {error.isAuth && (
                    <div className="mt-2 text-[11px] text-amber-800 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between gap-2">
                      <span>
                        Sign in to a configured private workspace to save feedback. Public demonstration reads stay available; no record was saved.
                      </span>
                      <button
                        type="button"
                        onClick={() => openSignInModal()}
                        className="shrink-0 px-2.5 py-1 rounded bg-amber-700 hover:bg-amber-800 text-white font-semibold text-[11px]"
                      >
                        Sign In Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-300 text-emerald-900 flex items-start gap-2.5">
              <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Feedback Created Successfully</div>
                <p className="mt-0.5 text-emerald-800">{success}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Feedback Text <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              maxLength={10000}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Enter exact verbatim customer review text..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono"
            />
            <span className="text-[11px] text-slate-400 block text-right mt-0.5">
              {review.length} / 10,000 characters
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Observed At (Optional Event Date)
            </label>
            <input
              type="datetime-local"
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Leave blank if customer complaint timestamp is unknown (preserves unobserved integrity).
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !review.trim()}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Save Feedback</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
