'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './auth-context';
import { IconClose, IconLock, IconShield, IconAlertTriangle } from '../icons';

function SignInDialogContent({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    const trimmedEmail = email.trim();
    const currentPassword = password;

    // Immediately clear password from local state for security
    setPassword('');
    setError(null);
    setLoading(true);

    // Client-side quick validation
    if (!trimmedEmail.includes('@') || trimmedEmail.length > 254) {
      setError('Please provide a valid email address (maximum 254 characters)');
      setLoading(false);
      return;
    }

    if (currentPassword.length > 1024) {
      setError('Password exceeds maximum allowed length');
      setLoading(false);
      return;
    }

    const result = await signIn(trimmedEmail, currentPassword);
    if (!result.success) {
      setError(result.error || 'Unable to sign in with those credentials');
      setLoading(false);
    } else {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to InsightFlow workspace"
        className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <IconLock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Sign In to Workspace
              </h2>
              <p className="text-[11px] text-slate-400">
                Authenticate for private datasets & actions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close sign-in dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl border bg-rose-50 border-rose-300 text-rose-900 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <IconAlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold text-[11px] text-rose-950 uppercase tracking-wider">
                    Sign-in Failed
                  </div>
                  <p className="mt-0.5 font-medium">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email-input"
              className="block font-semibold text-slate-700 mb-1"
            >
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              id="auth-email-input"
              ref={emailInputRef}
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@insightflow.internal"
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:bg-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password-input"
              className="block font-semibold text-slate-700 mb-1"
            >
              Password <span className="text-rose-500">*</span>
            </label>
            <input
              id="auth-password-input"
              type="password"
              required
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={loading}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:bg-slate-100 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Credentials are authenticated via secure HTTP-only cookie exchange.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <IconShield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Server-managed session</span>
            </div>
            <p className="text-slate-500 leading-normal">
              App code receives only a verified user ID. Session cookies are HTTP-only; the app does not store tokens in localStorage.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SignInModal() {
  const { isSignInModalOpen, closeSignInModal } = useAuth();
  if (!isSignInModalOpen) return null;
  return <SignInDialogContent onClose={closeSignInModal} />;
}
