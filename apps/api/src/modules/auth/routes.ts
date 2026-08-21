import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginBody, registerBody } from '@deliveryos/shared';
import { db, fromBool, insertReturning, newId, toBool, toDecimalString } from '../../db/index.js';
import { authenticate, clearSessionCookie, hashPassword, requireUser, setSessionCookie, signToken, verifyPassword } from '../../lib/auth.js';
import { parseBody, route } from '../../lib/http.js';
import { firstOrThrow } from '../../db/index.js';
import { unauthorized, conflict } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { capabilitiesFor, requireCapability } from '../../lib/rbac.js';

export const authRouter = Router();

/**
 * IPv6 hands a single client a /64 to rotate through, so the full address is
 * useless as a rate-limit key. Collapse to the /64 prefix; IPv4 is used as-is.
 */
function normaliseIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (!bare.includes(':')) return bare;
  return bare.split(':').slice(0, 4).join(':') + '::/64';
}

/**
 * Slows credential stuffing without locking out an office that shares one
 * public IP. Keying on IP alone means ten people behind one NAT burn a shared
 * budget, and a few mistyped passwords lock out everyone — so the bucket is
 * per (IP, email) and only failed attempts count against it.
 *
 * In-memory, so it resets on restart and does not span instances. Move it to a
 * Redis store before running more than one API process.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = String((req.body as { email?: unknown })?.email ?? '').toLowerCase().slice(0, 200);
    return `${normaliseIp(req.ip)}:${email}`;
  },
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many failed sign-in attempts for this account. Try again in a few minutes.',
    },
  },
});

authRouter.post(
  '/login',
  loginLimiter,
  route(async (req, res) => {
    const body = parseBody(loginBody, req.body);

    const user = await db('User').where({ email: body.email.toLowerCase() }).first();

    // Same message and roughly the same work for "no such user" and "wrong
    // password", so the response cannot be used to enumerate accounts.
    if (!user) {
      await hashPassword(body.password);
      throw unauthorized('Email or password is incorrect');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw unauthorized('Email or password is incorrect');
    if (!toBool(user.isActive)) throw unauthorized('This account is no longer active');

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    setSessionCookie(res, token);

    await db('User').where({ id: user.id }).update({ lastLoginAt: new Date() });
    await recordAudit({
      actorId: user.id,
      action: 'auth.signed_in',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.name} signed in`,
      request: req,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        jobTitle: user.jobTitle,
        avatarColor: user.avatarColor,
      },
      capabilities: capabilitiesFor(user),
    });
  }),
);

authRouter.post(
  '/logout',
  route(async (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  route(async (req, res) => {
    const auth = requireUser(req);
    const user = await firstOrThrow(
      db('User')
        .select('id', 'email', 'name', 'role', 'jobTitle', 'avatarColor', 'timezone', 'weeklyHours', 'lastLoginAt')
        .where({ id: auth.id })
        .first(),
      'User',
    );
    res.json({
      user: { ...user, weeklyHours: toDecimalString(user.weeklyHours) },
      capabilities: capabilitiesFor(auth),
    });
  }),
);

/** Account creation is an admin act (§4.1), not self-service registration. */
authRouter.post(
  '/users',
  authenticate,
  route(async (req, res) => {
    const actor = requireUser(req);
    requireCapability(actor, 'user.manage');
    const body = parseBody(registerBody, req.body);
    const email = body.email.toLowerCase();

    const existing = await db('User').select('id').where({ email }).first();
    if (existing) throw conflict('A user with that email already exists');

    const created = await insertReturning(db, 'User', {
      id: newId(),
      email,
      name: body.name,
      role: body.role,
      passwordHash: await hashPassword(body.password),
      avatarColor: pickAvatarColor(body.name),
    });
    const user = {
      id: created.id, email: created.email, name: created.name,
      role: created.role, avatarColor: created.avatarColor,
    };

    await recordAudit({
      actorId: actor.id,
      action: 'user.created',
      entityType: 'User',
      entityId: user.id,
      summary: `${actor.name} created ${user.name} (${user.role})`,
      detail: { email: user.email, role: user.role },
      request: req,
    });

    res.status(201).json({ user });
  }),
);

authRouter.get(
  '/users',
  authenticate,
  route(async (req, res) => {
    requireUser(req);
    // Any signed-in user may see the internal directory — it is how a PM picks
    // an assignee. Nothing sensitive is exposed here.
    const users = await db('User')
      .select('id', 'name', 'email', 'role', 'jobTitle', 'avatarColor')
      // MySQL stores this as TINYINT(1); `true` would not match.
      .where({ isActive: fromBool(true) })
      .orderBy('name', 'asc');
    res.json({ users });
  }),
);

const AVATAR_COLORS = ['#00A8FF', '#0086CC', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
