import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginBody, registerBody } from '@deliveryos/shared';
import { prisma } from '../../db.js';
import { authenticate, clearSessionCookie, hashPassword, requireUser, setSessionCookie, signToken, verifyPassword } from '../../lib/auth.js';
import { parseBody, route } from '../../lib/http.js';
import { unauthorized, conflict } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { capabilitiesFor, requireCapability } from '../../lib/rbac.js';

export const authRouter = Router();

/** Slows credential stuffing without locking a whole office out — the office shares an IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Try again in a few minutes.' } },
});

authRouter.post(
  '/login',
  loginLimiter,
  route(async (req, res) => {
    const body = parseBody(loginBody, req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

    // Same message and roughly the same work for "no such user" and "wrong
    // password", so the response cannot be used to enumerate accounts.
    if (!user) {
      await hashPassword(body.password);
      throw unauthorized('Email or password is incorrect');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw unauthorized('Email or password is incorrect');
    if (!user.isActive) throw unauthorized('This account is no longer active');

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    setSessionCookie(res, token);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
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
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.id },
      select: {
        id: true, email: true, name: true, role: true, jobTitle: true,
        avatarColor: true, timezone: true, weeklyHours: true, lastLoginAt: true,
      },
    });
    res.json({ user, capabilities: capabilitiesFor(auth) });
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

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw conflict('A user with that email already exists');

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        avatarColor: pickAvatarColor(body.name),
      },
      select: { id: true, email: true, name: true, role: true, avatarColor: true },
    });

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
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, jobTitle: true, avatarColor: true },
    });
    res.json({ users });
  }),
);

const AVATAR_COLORS = ['#00A8FF', '#0086CC', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}
