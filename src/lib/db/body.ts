import { z } from 'zod';
import { HttpError } from './errors';
export function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.APP_ORIGIN ?? request.url).origin;
  if (origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'FORBIDDEN', 'Same-origin requests are required');
}
export async function boundedBody(request: Request, maxBytes: number) {
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > maxBytes)) throw new HttpError(413, 'FILE_TOO_LARGE', 'Request exceeds size limit');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'INVALID_BODY', 'Request body required');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new HttpError(413, 'FILE_TOO_LARGE', 'Request exceeds size limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function jsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new HttpError(400, 'INVALID_BODY', 'Expected application/json');
  const bytes = await boundedBody(request, 64 * 1024);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'INVALID_BODY', 'Malformed JSON'); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'INVALID_BODY', 'Invalid request fields');
  return parsed.data;
}
