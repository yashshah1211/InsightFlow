'use client';

import React, { useState } from 'react';
import { useAuth } from './auth-context';
import { IconDatabase, IconChevronDown, IconCheckCircle } from '../icons';

export function BatchSelector() {
  const { selectedBatchId, setSelectedBatchId, knownBatches, user, batchesLoading, batchesError, hasMoreBatches, refreshBatches } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const activeBatch = selectedBatchId
    ? knownBatches.find((b) => b.id === selectedBatchId)
    : null;

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="true"
          aria-expanded={isOpen}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            selectedBatchId
              ? 'bg-amber-950/40 text-amber-300 border-amber-700/80 hover:bg-amber-900/50'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
          }`}
          title="Select active dataset or private batch"
        >
          <IconDatabase
            className={`w-3.5 h-3.5 shrink-0 ${
              selectedBatchId ? 'text-amber-400' : 'text-emerald-400'
            }`}
          />
          <span className="font-mono text-[11px] truncate max-w-[160px] sm:max-w-[200px]">
            {selectedBatchId
              ? activeBatch?.filename || `Batch: ${selectedBatchId.slice(0, 8)}…`
              : 'Public benchmark'}
          </span>
          <IconChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div
              role="menu"
              className="absolute left-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-50 py-1.5 text-xs text-slate-200 overflow-y-auto max-h-[70vh] font-sans"
            >
              <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Select Active Dataset
              </div>

              {/* Public Official Option */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSelectedBatchId(undefined);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 transition-colors ${
                  !selectedBatchId ? 'bg-slate-800/80 text-white font-semibold' : 'text-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Public benchmark dataset</span>
                  </div>
                  <div className="text-[10px] text-slate-400 ml-3.5">
                    Source and counts shown by the API · Read-only
                  </div>
                </div>
                {!selectedBatchId && <IconCheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
              </button>

              {/* Private Batches Section */}
              {knownBatches.length > 0 && (
                <>
                  <div className="px-3 py-1.5 border-t border-b border-slate-800 text-[10px] uppercase font-bold text-amber-400 tracking-wider mt-1">
                    Private Workspace Batches
                  </div>
                  {knownBatches.map((batch) => {
                    const isSelected = selectedBatchId === batch.id;
                    return (
                      <button
                        key={batch.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setSelectedBatchId(batch.id);
                          setIsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 transition-colors ${
                          isSelected ? 'bg-amber-950/40 text-amber-200 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] truncate">
                            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            <span className="truncate">{batch.filename}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 ml-3.5 truncate">
                            {batch.id} ({batch.recordCount} rows · {new Date(batch.createdAt).toLocaleDateString()})
                          </div>
                        </div>
                        {isSelected && <IconCheckCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </>
              )}

              {user && (
                <div className="pt-1 border-t border-slate-800 mt-1 px-3 py-2 space-y-2">
                  {batchesLoading && <p>Loading private batches…</p>}
                  {batchesError && <p role="alert" className="text-amber-300">{batchesError}</p>}
                  {!batchesLoading && !batchesError && knownBatches.length === 0 && <p>No private batches yet.</p>}
                  <button type="button" disabled={batchesLoading} onClick={() => { setPage(1); void refreshBatches(); }} className="underline">Refresh private batches</button>
                  {hasMoreBatches && <button type="button" disabled={batchesLoading} onClick={() => { const next = page + 1; setPage(next); void refreshBatches(next); }} className="block underline">Load more batches</button>}
                </div>
              )}

              {!user && (
                <div className="p-2.5 m-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                  <span className="text-amber-400 font-medium">Tip:</span> Sign in to discover your private batches.
                </div>
              )}
            </div>
          </>
        )}
      </div>

    </>
  );
}
