import 'server-only';
import { z } from 'zod';
import { ErrorResponse, type ErrorCode } from '@/lib/contracts';
import { getRepository } from './index';
import { HttpError } from './errors';
import { privateSnapshot } from './supabase-repository';
export { HttpError } from './errors';
export function errorResponse(status: number, code: z.infer<typeof ErrorCode>, message: string) {
  return Response.json(ErrorResponse.parse({ error: { code, message } }), { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function handle(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.code, error.message);
    // Never echo validation internals, request contents, secrets, or database errors.
    return errorResponse(500, 'INTERNAL_ERROR', 'Unable to complete request');
  }
}
export function query<T extends z.ZodType>(request: Request, schema: T): z.output<T> {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(raw, key)) throw new HttpError(400, 'INVALID_QUERY', 'Duplicate query parameters are not allowed');
    raw[key] = value;
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters');
  return result.data;
}
export async function snapshot(batchId?: string) {
  if (process.env.INSIGHTFLOW_DATA_MODE === 'database' && !process.env.SUPABASE_URL) throw new HttpError(503, 'NOT_CONFIGURED', 'Database adapter is not configured');
  let data;
  try {
    data = process.env.INSIGHTFLOW_DATA_MODE === 'database' || (batchId && z.uuid().safeParse(batchId).success)
      ? await privateSnapshot(batchId) : await getRepository().snapshot(batchId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'NOT_CONFIGURED', 'Selected dataset is unavailable or invalid; prepare the official artifact or configure persistence');
  }
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'Batch not found');
  return data;
}
export function json<T extends z.ZodType>(schema: T, value: z.input<T>) {
  return Response.json(schema.parse(value), { headers: { 'Cache-Control': 'private, no-store' } });
}
export function rejectWrite() {
  return errorResponse(401, 'UNAUTHENTICATED', 'Authenticated persistence is not configured or enabled');
}
