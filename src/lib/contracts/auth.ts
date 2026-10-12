import { z } from 'zod';
// Additive auth protocol, independent of the frozen domain contract v1.0.0.
export const SignInRequest = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(1024) });
export const AuthSessionResponse = z.strictObject({ data: z.strictObject({ userId: z.uuid().nullable() }),
  meta: z.strictObject({ contractVersion: z.literal('auth-1.0.0') }) });
