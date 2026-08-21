import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@deliveryos/shared';
import { env } from '../env.js';
import { db, toBool } from '../db/index.js';
import { unauthorized } from './errors.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export const AUTH_COOKIE = 'deliveryos_session';

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE];
  return cookie ?? null;
}

/**
 * Resolves the caller on every request. The user is re-read from the database
 * rather than trusted from the token body, so deactivating an account takes
 * effect on the next request instead of when the token expires (§4.1 "rapid
 * deactivation").
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readToken(req);
    if (!token) throw unauthorized();

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw unauthorized('Your session has expired. Sign in again.');
    }

    const user = await db('User')
      .select('id', 'email', 'name', 'role', 'isActive')
      .where({ id: String(payload.sub) })
      .first();

    // MySQL returns TINYINT(1) as 0/1, and `!user.isActive` is false for both
    // — a deactivated account would keep working without this conversion.
    if (!user || !toBool(user.isActive)) throw unauthorized('This account is no longer active');

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
