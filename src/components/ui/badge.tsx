import React from 'react';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'danger'
  | 'critical'
  | 'info'
  | 'neutral'
  | 'purple';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
}

export function Badge({ variant = 'default', size = 'sm', children, className = '', ...props }: BadgeProps) {
  const base = 'inline-flex items-center font-medium rounded-full tracking-wide transition-colors';
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs';

  const variants: Record<BadgeVariant, string> = {
    default: 'bg-slate-900 text-white',
    secondary: 'bg-slate-100 text-slate-700 border border-slate-200',
    outline: 'border border-slate-300 text-slate-700 bg-white',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    critical: 'bg-rose-600 text-white font-semibold shadow-xs',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
    neutral: 'bg-slate-100 text-slate-600 border border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  };

  return (
    <span className={`${base} ${sizeClasses} ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case 'critical':
      return <Badge variant="critical">Critical</Badge>;
    case 'high':
      return <Badge variant="danger">High</Badge>;
    case 'medium':
      return <Badge variant="warning">Medium</Badge>;
    case 'low':
      return <Badge variant="info">Low</Badge>;
    default:
      return <Badge variant="neutral">{severity}</Badge>;
  }
}

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  switch (sentiment) {
    case 'positive':
      return <Badge variant="success">Positive</Badge>;
    case 'negative':
      return <Badge variant="danger">Negative</Badge>;
    case 'neutral':
      return <Badge variant="secondary">Neutral</Badge>;
    case 'mixed':
      return <Badge variant="purple">Mixed (Nuanced)</Badge>;
    case 'unknown':
    default:
      return <Badge variant="neutral">Unknown (Unannotated)</Badge>;
  }
}

export function IssueStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'open':
      return <Badge variant="warning">Open</Badge>;
    case 'investigating':
      return <Badge variant="info">Investigating</Badge>;
    case 'planned':
      return <Badge variant="purple">Planned</Badge>;
    case 'resolved':
      return <Badge variant="success">Resolved</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export function SourceBadge({ source }: { source: string }) {
  if (source === 'official_csv') {
    return <Badge variant="success" className="bg-emerald-600 text-white">Official Dataset</Badge>;
  }
  if (source === 'fixture') {
    return <Badge variant="warning">Development Fixture</Badge>;
  }
  if (source === 'upload') {
    return <Badge variant="info">Uploaded Batch</Badge>;
  }
  return <Badge variant="neutral">{source}</Badge>;
}
