'use client';

import React, { useState } from 'react';
import { submitCsvImport, ApiError } from '../api-client';
import { useAuth } from './auth-context';
import { IconClose, IconUpload, IconAlertTriangle, IconCheckCircle, IconLock } from '../icons';

const MAX_CSV_UI_BYTES = 4 * 1024 * 1024; // 4 MiB deployment-safe ceiling for Vercel

export function CsvImportModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { user, openSignInModal, selectWrittenBatch } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; isAuth?: boolean } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError({
        code: 'MISSING_FILE',
        message: 'Please select a CSV file before submitting.',
      });
      return;
    }

    if (file.size === 0) {
      setError({
        code: 'EMPTY_FILE',
        message: 'Selected CSV file is empty (0 bytes). Please upload a file with feedback data.',
      });
      return;
    }

    // Task 4: 4 MiB conservative deployment-safe limit
    if (file.size > MAX_CSV_UI_BYTES) {
      setError({
        code: 'FILE_TOO_LARGE',
        message: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MiB) exceeds the 4 MiB deployment-safe ceiling (Vercel payload constraint). Please reduce file size.`,
      });
      return;
    }

    // Pre-flight header inspection
    try {
      const headerChunk = await file.slice(0, 2048).text();
      const firstLine = headerChunk.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
      if (!/^\s*(?:review|"review")\s*,\s*(?:category|"category")\s*$/.test(firstLine)) {
        setError({
          code: 'INVALID_CSV_HEADERS',
          message: `CSV header must declare both "review" and "category" columns. Found: "${firstLine.slice(0, 80)}"`,
        });
        return;
      }
    } catch {
      setError({
        code: 'UNREADABLE_FILE',
        message: 'Could not inspect file contents. Ensure the file is UTF-8 encoded.',
      });
      return;
    }

    setLoading(true);

    try {
      const res = await submitCsvImport(file);
      const batchId = res.data.batchId;
      await selectWrittenBatch(batchId);

      setSuccess(
        `Imported batch ${batchId}: ${res.data.recordCount} rows accepted, ${res.data.uniqueTextCount} distinct patterns.${
          res.data.idempotentReplay ? ' (Idempotent replay detected: existing batch returned)' : ''
        }`
      );
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
          code: 'UPLOAD_FAILED',
          message: err instanceof Error ? err.message : 'Unknown upload failure occurred',
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
        aria-label="Import feedback CSV"
        className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Import Customer Feedback CSV</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload customer feedback batch (UTF-8 CSV format · 4 MiB limit)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close CSV import"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="p-6 space-y-4 text-xs">
          {!user && (
            <div className="p-3.5 rounded-xl border bg-amber-50/80 border-amber-300 text-amber-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <IconLock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-950">
                    Public Demonstration Mode
                  </div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    CSV imports write to private tenant storage and require an authenticated session with configured database persistence.
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
                      ? '401 UNAUTHENTICATED — Sign-in or Configuration Required'
                      : error.code}
                  </div>
                  <p className="mt-1 font-medium">{error.message}</p>
                  {error.isAuth && (
                    <div className="mt-2 text-[11px] text-amber-800 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200 flex items-center justify-between gap-2">
                      <span>
                        Sign in to a configured private workspace to import feedback. Public demonstration data stays read-only; no batch was saved.
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
                <div className="font-bold">Import Complete</div>
                <p className="mt-0.5 text-emerald-800">{success}</p>
              </div>
            </div>
          )}

          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-slate-400 transition-colors">
            <IconUpload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError(null);
                setSuccess(null);
              }}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Deployment limit: <strong className="text-slate-700">4 MiB</strong> · Required header:{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-800">
                review,category
              </code>
            </p>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70 text-[11px] text-slate-600">
            <strong>Idempotent Ingestion Rule:</strong> Retrying the identical CSV content under the same scope safely returns the existing batch without double-counting records.
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
              disabled={loading || !file}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Uploading & Processing…</span>
                </>
              ) : (
                <span>Upload & Process CSV</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
