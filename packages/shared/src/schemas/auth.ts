import { z } from 'zod';
import { ROLES } from '../enums.js';

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginBody = z.infer<typeof loginBody>;

export const registerBody = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(200)
    .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
      message: 'Include an uppercase letter, a lowercase letter and a digit',
    }),
  role: z.enum(ROLES),
});
export type RegisterBody = z.infer<typeof registerBody>;

export const sessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(ROLES),
  jobTitle: z.string().nullable(),
  avatarColor: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUser>;
