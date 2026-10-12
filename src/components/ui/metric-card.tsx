import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  isUnavailable?: boolean;
  unavailableReason?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  badge,
  icon,
  hint,
  isUnavailable = false,
  unavailableReason,
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs transition-all hover:border-slate-300">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div className="flex items-center gap-1.5">
          {badge}
          {icon && <div className="text-slate-400">{icon}</div>}
        </div>
      </div>

      {isUnavailable ? (
        <div className="my-1">
          <div className="text-xl font-medium text-slate-400 italic">Unavailable</div>
          <p className="text-xs text-amber-700/90 bg-amber-50 rounded-md p-1.5 mt-2 border border-amber-200/60">
            {unavailableReason || 'Source has no timestamps or customer IDs'}
          </p>
        </div>
      ) : (
        <div className="my-1">
          <div className="text-3xl font-bold tracking-tight text-slate-900 font-mono">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtitle && <p className="text-xs font-medium text-slate-600 mt-1">{subtitle}</p>}
        </div>
      )}

      {hint && !isUnavailable && (
        <p className="text-xs text-slate-400 mt-2 border-t border-slate-100 pt-2 font-mono">
          {hint}
        </p>
      )}
    </div>
  );
}
