import { z } from 'zod';
import { ErrorCode } from '@/lib/contracts';
export class HttpError extends Error {
  constructor(public status: number, public code: z.infer<typeof ErrorCode>, message: string) { super(message); }
}
