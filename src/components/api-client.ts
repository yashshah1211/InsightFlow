import {
  DashboardResponseType,
  FeedbackResponseType,
  IssuesResponseType,
  IssueDetailResponseType,
  DecisionsResponseType,
  DataLabResponseType,
  DashboardResponse,
  FeedbackResponse,
  IssuesResponse,
  IssueDetailResponse,
  DecisionsResponse,
  DataLabResponse,
  ErrorResponse,
  Category,
  Sentiment,
  Objective,
  IssueStatus,
  ActionResponse,
  IssuePatchResponse,
  ManualFeedbackResponse,
  ImportResponse,
} from '@/lib/contracts';
import { AuthSessionResponse } from '@/lib/contracts/auth';
import { BatchesResponse } from '@/lib/contracts/batches';
import { z } from 'zod';

export type AuthSessionResponseType = z.infer<typeof AuthSessionResponse>;

export class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function handleResponse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('HTTP_ERROR', `Request failed with status ${res.status}; response unavailable`, res.status);
  }

  if (!res.ok) {
    if (res.status === 401 && res.url && (new URL(res.url).searchParams.has('batchId') || new URL(res.url).pathname === '/api/batches')) {
      window.dispatchEvent(new Event('insightflow:session-expired'));
    } else if (res.status === 401 && res.url && !new URL(res.url).pathname.startsWith('/api/auth/')) {
      // A disabled mutation and an expired session both use frozen UNAUTHENTICATED.
      // Reverify Auth rather than guessing identity from an error message.
      window.dispatchEvent(new Event('insightflow:verify-session'));
    }
    const errParse = ErrorResponse.safeParse(json);
    if (errParse.success) {
      throw new ApiError(errParse.data.error.code, errParse.data.error.message, res.status);
    }
    throw new ApiError('HTTP_ERROR', `Request failed with status ${res.status}`, res.status);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('SCHEMA_MISMATCH', 'Response did not conform to the frozen contract', res.status);
  }

  return parsed.data;
}

export async function fetchBatches(params: { page?: number; batchId?: string } = {}) {
  const search = new URLSearchParams({ page: String(params.page ?? 1) });
  if (params.batchId) search.set('batchId', params.batchId);
  return handleResponse(await fetch(`/api/batches?${search}`, { credentials: 'same-origin', cache: 'no-store' }), BatchesResponse);
}

export async function fetchDashboard(batchId?: string): Promise<DashboardResponseType> {
  const url = batchId ? `/api/dashboard?batchId=${encodeURIComponent(batchId)}` : '/api/dashboard';
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, DashboardResponse);
}

export interface FeedbackQueryParams {
  batchId?: string;
  q?: string;
  category?: z.infer<typeof Category>;
  sentiment?: z.infer<typeof Sentiment>;
  view?: 'records' | 'patterns';
  page?: number;
  pageSize?: number;
}

export async function fetchFeedback(params: FeedbackQueryParams = {}): Promise<FeedbackResponseType> {
  const searchParams = new URLSearchParams();
  if (params.batchId) searchParams.set('batchId', params.batchId);
  if (params.q) searchParams.set('q', params.q);
  if (params.category) searchParams.set('category', params.category);
  if (params.sentiment) searchParams.set('sentiment', params.sentiment);
  if (params.view) searchParams.set('view', params.view);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.pageSize !== undefined) searchParams.set('pageSize', String(params.pageSize));

  const url = `/api/feedback?${searchParams.toString()}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, FeedbackResponse);
}

export async function fetchIssues(status?: z.infer<typeof IssueStatus>, batchId?: string): Promise<IssuesResponseType> {
  const searchParams = new URLSearchParams();
  if (batchId) searchParams.set('batchId', batchId);
  if (status) searchParams.set('status', status);

  const qs = searchParams.toString();
  const url = `/api/issues${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, IssuesResponse);
}

export async function fetchIssueDetail(id: string, batchId?: string): Promise<IssueDetailResponseType> {
  const url = batchId ? `/api/issues/${encodeURIComponent(id)}?batchId=${encodeURIComponent(batchId)}` : `/api/issues/${encodeURIComponent(id)}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, IssueDetailResponse);
}

export async function fetchDecisions(objective: z.infer<typeof Objective> = 'safety', batchId?: string): Promise<DecisionsResponseType> {
  const searchParams = new URLSearchParams({ objective });
  if (batchId) searchParams.set('batchId', batchId);

  const url = `/api/decisions?${searchParams.toString()}`;
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, DecisionsResponse);
}

export async function fetchDataLab(batchId?: string): Promise<DataLabResponseType> {
  const url = batchId ? `/api/data-lab?batchId=${encodeURIComponent(batchId)}` : '/api/data-lab';
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  return handleResponse(res, DataLabResponse);
}

export async function submitManualFeedback(review: string, category: z.infer<typeof Category>, observedAt?: string | null) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ review, category, observedAt: observedAt ?? null }),
  });
  return handleResponse(res, ManualFeedbackResponse);
}

export async function submitCsvImport(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/feedback/import', {
    method: 'POST',
    credentials: 'same-origin',
    body: formData,
  });
  return handleResponse(res, ImportResponse);
}

export async function patchIssue(id: string, patch: { status?: z.infer<typeof IssueStatus>; notes?: string }) {
  const res = await fetch(`/api/issues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(patch),
  });
  return handleResponse(res, IssuePatchResponse);
}

export async function addIssueAction(id: string, description: string, notes: string = '') {
  const res = await fetch(`/api/issues/${encodeURIComponent(id)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ description, notes }),
  });
  return handleResponse(res, ActionResponse);
}

export async function signIn(email: string, password: string): Promise<AuthSessionResponseType> {
  const res = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res, AuthSessionResponse);
}

export async function fetchSession(): Promise<AuthSessionResponseType> {
  const res = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return handleResponse(res, AuthSessionResponse);
}

export async function signOut(): Promise<AuthSessionResponseType> {
  const res = await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'same-origin',
  });
  return handleResponse(res, AuthSessionResponse);
}

