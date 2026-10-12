'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconDashboard,
  IconFeedback,
  IconIssues,
  IconDecisions,
  IconReports,
  IconDataLab,
  IconPlus,
  IconUpload,
  IconShield,
  IconUser,
  IconLogOut,
} from '../icons';
import { ManualFeedbackModal } from './manual-feedback-modal';
import { CsvImportModal } from './csv-import-modal';
import { SignInModal } from './sign-in-modal';
import { BatchSelector } from './batch-selector';
import { useAuth } from './auth-context';
import { fetchDashboard } from '../api-client';
import type { DashboardResponseType } from '@/lib/contracts';

interface NavItem {
  id: string;
  name: string;
  shortName: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: '', name: 'Command Center', shortName: 'Overview', href: '/', icon: IconDashboard },
  { id: 'feedback', name: 'Feedback Explorer', shortName: 'Feedback', href: '/feedback', icon: IconFeedback },
  { id: 'issues', name: 'Issue Intelligence', shortName: 'Issues', href: '/issues', icon: IconIssues },
  { id: 'decisions', name: 'Decision Studio', shortName: 'Decisions', href: '/decisions', icon: IconDecisions },
  { id: 'reports', name: 'Executive Reports', shortName: 'Reports', href: '/reports', icon: IconReports },
  { id: 'data-lab', name: 'Data Lab', shortName: 'Data Lab', href: '/data-lab', icon: IconDataLab },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, openSignInModal, signOut, selectedBatchId, signingOut, authError } = useAuth();
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardResponseType | null>(null);
  const [sourceError, setSourceError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDashboard(selectedBatchId)
      .then((data) => {
        if (active) {
          setSnapshot(data);
          setSourceError(false);
        }
      })
      .catch(() => {
        if (active) {
          setSnapshot(null);
          setSourceError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedBatchId]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-slate-900 selection:text-white">
      {/* 1. Global Meta & Integrity Status Header */}
      <header className="bg-slate-950 text-slate-300 text-xs py-2 px-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 z-30 font-mono">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 font-sans font-bold text-white tracking-wide hover:text-slate-200"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-xs" />
            <span className="text-sm">INSIGHTFLOW</span>
          </Link>
          <span className="hidden sm:inline text-slate-600">|</span>

          {/* Dataset / Batch Selector */}
          <BatchSelector />

          {/* Dataset Status Badge */}
          <span className="text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 text-[11px] font-medium hidden md:inline">
            {snapshot
              ? `${
                  snapshot.meta.provenance.source === 'official_csv'
                    ? 'Official CSV artifact'
                    : snapshot.meta.provenance.source === 'fixture'
                    ? 'Development fixture'
                    : snapshot.meta.provenance.source === 'upload'
                    ? 'Private CSV upload'
                    : 'Private workspace batch'
                } (${snapshot.data.summary.recordCount.toLocaleString()} rows · ${
                  snapshot.data.summary.uniqueTextCount
                } patterns)`
              : sourceError
              ? 'Dataset unavailable'
              : 'Loading dataset…'}
          </span>
        </div>

        {/* Auth & Environment Controls */}
        <div className="flex items-center gap-2 text-[11px]">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-emerald-300 bg-emerald-950/80 px-2 py-1 rounded border border-emerald-700/80 flex items-center gap-1.5 font-mono">
                <IconUser className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Workspace:</span>
                <span>{user.userId.slice(0, 8)}…</span>
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                disabled={signingOut}
                className="text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Sign out of private workspace"
              >
                <IconLogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-amber-400 bg-amber-950/70 px-2 py-1 rounded border border-amber-800/80 hidden sm:inline">
                Public Demo Mode
              </span>
              <button
                type="button"
                onClick={() => openSignInModal()}
                className="text-emerald-300 hover:text-white bg-slate-900 hover:bg-emerald-950/70 px-3 py-1 rounded-lg border border-emerald-700/80 font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Sign in to private workspace"
              >
                <IconUser className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sign In</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {authError && <div role="alert" className="px-4 py-2 text-xs bg-amber-50 text-amber-900">{authError}</div>}

      {/* 2. Main Navigation Bar with Responsive Scroll & Action Buttons */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200/90 shadow-2xs no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 h-14">
          {/* Universal Main Navigation (Single element for both mobile and desktop) */}
          <nav
            aria-label="Main navigation"
            className="flex-1 min-w-0 flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 scrollbar-none"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={selectedBatchId ? `${item.href}?batchId=${encodeURIComponent(selectedBatchId)}` : item.href}
                  aria-label={item.id || 'Overview'}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}
                  />
                  <span>{item.id || 'Overview'}</span>
                  <span className="hidden md:inline font-normal text-slate-400 ml-0.5">
                    ({item.shortName})
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
              title="Add manual feedback record"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Record</span>
            </button>
            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
              title="Import CSV feedback batch"
            >
              <IconUpload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">{children}</main>

      {/* 4. Footer with Defensible Methodology Note */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 sm:px-6 lg:px-8 mt-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <IconShield className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>InsightFlow</strong> · Build Battle 2026 Evidence-First Decision Platform
            </span>
          </div>
          <div className="text-slate-400 text-[11px] font-mono text-center sm:text-right">
            {snapshot
              ? `${snapshot.meta.provenance.source} · ${snapshot.meta.provenance.methodologyVersion} · Contract ${snapshot.meta.contractVersion}`
              : 'Dataset status pending'}
          </div>
        </div>
      </footer>

      {/* Auth & Quick Action Modals */}
      <SignInModal />
      <ManualFeedbackModal
        isOpen={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
      />
      <CsvImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}
