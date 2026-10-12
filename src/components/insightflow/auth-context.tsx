'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { signIn as apiSignIn, fetchSession, signOut as apiSignOut, fetchBatches, ApiError } from '../api-client';
import type { PrivateBatchType } from '@/lib/contracts/batches';

interface AuthContextValue {
  user: { userId: string } | null; loading: boolean; signingOut: boolean; authError: string | null;
  isSignInModalOpen: boolean; openSignInModal: () => void; closeSignInModal: () => void;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>; refreshSession: () => Promise<void>;
  selectedBatchId: string | undefined; setSelectedBatchId: (id: string | undefined) => void;
  knownBatches: PrivateBatchType[]; batchesLoading: boolean; batchesError: string | null;
  hasMoreBatches: boolean; refreshBatches: (page?: number) => Promise<void>;
  selectWrittenBatch: (id: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const selectionKey = 'insightflow:selected-batch';
function savedSelection() {
  try { return JSON.parse(localStorage.getItem(selectionKey) ?? 'null') as { userId?: string; batchId?: string } | null; }
  catch { return null; }
}
function saveSelection(userId?: string, batchId?: string) {
  try {
    if (userId && batchId) localStorage.setItem(selectionKey, JSON.stringify({ userId, batchId }));
    else localStorage.removeItem(selectionKey);
  } catch { /* Storage may be disabled; server authorization never relies on it. */ }
}
function selectionUrl(batchId?: string, clearIssue = true) {
  const url = new URL(window.location.href);
  if (batchId) url.searchParams.set('batchId', batchId); else url.searchParams.delete('batchId');
  if (clearIssue) url.searchParams.delete('id');
  window.history.replaceState(null, '', url);
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ userId: string } | null>(null);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const [epoch, setEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [selectedBatchId, selectBatch] = useState<string>();
  const [knownBatches, setBatches] = useState<PrivateBatchType[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [hasMoreBatches, setHasMore] = useState(false);
  const clearPrivate = useCallback((clearSaved = true) => {
    generation.current++; identity.current = null;
    setUser(null); selectBatch(undefined); setBatches([]); setHasMore(false);
    setBatchesLoading(false); setBatchesError(null); setEpoch(value => value + 1);
    if (clearSaved) { saveSelection(); selectionUrl(); }
  }, []);
  const refreshBatches = useCallback(async (page = 1) => {
    if (!identity.current || signingOutRef.current) return;
    const current = generation.current;
    setBatchesLoading(true); setBatchesError(null);
    try {
      const response = await fetchBatches({ page });
      if (current !== generation.current) return;
      setBatches(previous => page === 1 ? response.data.items : [...previous, ...response.data.items.filter(item => !previous.some(old => old.id === item.id))]);
      setHasMore(page < response.meta.totalPages);
    } catch (error) {
      if (current !== generation.current) return;
      setBatchesError(error instanceof Error ? error.message : 'Private batches unavailable');
    } finally { if (current === generation.current) setBatchesLoading(false); }
  }, []);
  const activate = useCallback(async (userId: string) => {
    if (identity.current === userId) return;
    generation.current++; identity.current = userId;
    setUser({ userId }); selectBatch(undefined); setBatches([]); setEpoch(value => value + 1);
    const current = generation.current;
    await refreshBatches();
    const linkBatch = new URL(window.location.href).searchParams.get('batchId');
    const saved = linkBatch ? { userId, batchId: linkBatch } : savedSelection();
    if (current !== generation.current || saved?.userId !== userId || !saved.batchId) return;
    try {
      const response = await fetchBatches({ batchId: saved.batchId });
      if (current !== generation.current) return;
      const batch = response.data.items[0];
      if (batch) {
        setBatches(previous => previous.some(item => item.id === batch.id) ? previous : [batch, ...previous]);
        selectBatch(batch.id); saveSelection(userId, batch.id);
      } else { saveSelection(); selectionUrl(); }
    } catch { if (current === generation.current) { saveSelection(); selectionUrl(); } }
  }, [refreshBatches]);
  const refreshSession = useCallback(async () => {
    if (signingOutRef.current) return;
    const current = generation.current;
    try {
      const response = await fetchSession();
      if (current !== generation.current || signingOutRef.current) return;
      if (response.data.userId) await activate(response.data.userId);
      else if (identity.current) clearPrivate();
      else saveSelection();
    } catch {
      if (current === generation.current) {
        if (identity.current) clearPrivate(); else saveSelection();
      }
    }
    finally { setLoading(false); }
  }, [activate, clearPrivate]);
  useEffect(() => {
    void Promise.resolve().then(refreshSession);
    const refresh = () => { if (identity.current) clearPrivate(false); void refreshSession(); };
    const expired = () => { clearPrivate(); setAuthError('Session expired. Sign in again.'); };
    const verify = () => { void refreshSession(); };
    const hidden = () => { clearPrivate(false); };
    window.addEventListener('pagehide', hidden);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    window.addEventListener('insightflow:session-expired', expired);
    window.addEventListener('insightflow:verify-session', verify);
    const timer = window.setInterval(() => { void refreshSession(); }, 60000);
    return () => {
      clearInterval(timer); window.removeEventListener('pagehide', hidden); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh); window.removeEventListener('insightflow:session-expired', expired);
      window.removeEventListener('insightflow:verify-session', verify);
    };
  }, [refreshSession, clearPrivate]);
  const setSelectedBatchId = (id: string | undefined) => {
    if (id && (!identity.current || signingOutRef.current || !knownBatches.some(batch => batch.id === id))) return;
    selectBatch(id); saveSelection(identity.current ?? undefined, id); selectionUrl(id);
  };
  const selectWrittenBatch = async (id: string) => {
    const current = generation.current;
    if (!identity.current || signingOutRef.current) return;
    await refreshBatches();
    try {
      const response = await fetchBatches({ batchId: id });
      if (current !== generation.current) return;
      const batch = response.data.items[0];
      if (!batch) { setBatchesError('Saved batch unavailable; refresh discovery.'); return; }
      setBatches(previous => previous.some(item => item.id === id) ? previous : [batch, ...previous]);
      selectBatch(id); saveSelection(identity.current ?? undefined, id); selectionUrl(id);
    } catch (error) { if (current === generation.current) setBatchesError(error instanceof Error ? error.message : 'Saved batch unavailable'); }
  };
  const signIn = async (email: string, password: string) => {
    const current = generation.current;
    try {
      const response = await apiSignIn(email, password);
      if (current !== generation.current) return { success: false, error: 'Session changed; retry sign-in.' };
      if (!response.data.userId) return { success: false, error: 'Authentication returned no user session' };
      setAuthError(null); setIsSignInModalOpen(false); await activate(response.data.userId);
      return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Authentication failed' }; }
  };
  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true; setSigningOut(true); setAuthError(null);
    generation.current++; selectBatch(undefined); setBatches([]); setHasMore(false);
    setBatchesLoading(false); setEpoch(value => value + 1); saveSelection(); selectionUrl();
    try { await apiSignOut(); clearPrivate(); }
    catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) clearPrivate();
      else setAuthError('Server sign-out failed. Private view cleared; retry Sign Out to end the session.');
    } finally { signingOutRef.current = false; setSigningOut(false); }
  };
  const value: AuthContextValue = { user, loading, signingOut, authError, isSignInModalOpen,
    openSignInModal: () => setIsSignInModalOpen(true), closeSignInModal: () => setIsSignInModalOpen(false),
    signIn, signOut, refreshSession, selectedBatchId, setSelectedBatchId, knownBatches,
    batchesLoading, batchesError, hasMoreBatches, refreshBatches, selectWrittenBatch };
  return <AuthContext.Provider value={value}>
    {/* Destroy page/drawer/report/modal state on identity or batch changes. Old callbacks target unmounted components. */}
    <React.Fragment key={`${epoch}:${selectedBatchId ?? 'public'}`}>{children}</React.Fragment>
  </AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
