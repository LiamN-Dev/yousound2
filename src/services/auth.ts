/**
 * Server-side authentication for YouSong.
 *
 *  - Passwords: salted scrypt (old weak hashes still verify, then get upgraded on login)
 *  - Sessions: signed, httpOnly cookie. The server decides who you are from the cookie,
 *    never from what the browser says in the request body.
 *  - Route rules: one central table says which routes are public / login / member / admin.
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getUserByUid } from '../db/queries.ts';
import { getActiveConnectionString } from '../db/index.ts';

const COOKIE_NAME = 'ys_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- passwords
function legacyHash(pass: string): string {
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    hash = (hash << 5) - hash + pass.charCodeAt(i);
    hash |= 0;
  }
  return `hash_v2_${Math.abs(hash).toString(16)}_${Buffer.from(pass, 'binary').toString('base64').slice(0, 8)}`;
}

function scryptAsync(pass: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pass, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function hashPasswordSecure(pass: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pass, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  pass: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored || typeof pass !== 'string' || !pass) return { ok: false, needsUpgrade: false };

  if (stored.startsWith('scrypt$')) {
    const [, saltHex, keyHex] = stored.split('$');
    if (!saltHex || !keyHex) return { ok: false, needsUpgrade: false };
    const key = await scryptAsync(pass, Buffer.from(saltHex, 'hex'));
    return { ok: safeEqual(key.toString('hex'), keyHex), needsUpgrade: false };
  }

  if (stored.startsWith('hash_v2_')) {
    // Old weak hash: compare by hashing what was typed. Sending the stored hash itself does NOT work.
    return { ok: safeEqual(legacyHash(pass), stored), needsUpgrade: true };
  }

  // Very old accounts that stored the password as plain text
  return { ok: safeEqual(stored, pass), needsUpgrade: true };
}

// ---------------------------------------------------------------- sessions
let secretCache: Buffer | null = null;

function getSecret(): Buffer {
  if (secretCache) return secretCache;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 16) {
    secretCache = Buffer.from(env);
  } else {
    const conn = getActiveConnectionString() || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (conn) {
      console.warn('[Security] SESSION_SECRET is not set. Using a key derived from your database URL. Add SESSION_SECRET in Render for better security.');
      secretCache = crypto.createHash('sha256').update(`yousong-session:${conn}`).digest();
    } else {
      console.warn('[Security] SESSION_SECRET is not set. Using a temporary key, so everyone must log in again after each restart.');
      secretCache = crypto.randomBytes(32);
    }
  }
  return secretCache;
}

const b64u = (buf: Buffer) => buf.toString('base64url');
const sign = (body: string) => b64u(crypto.createHmac('sha256', getSecret()).update(body).digest());
const pwStamp = (hash?: string | null) =>
  crypto.createHash('sha256').update(hash || '').digest('hex').slice(0, 12);

export function createSessionToken(user: { uid: string; passwordHash?: string | null }): string {
  const payload = { u: user.uid, e: Date.now() + SESSION_MS, p: pwStamp(user.passwordHash) };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, user: { uid: string; passwordHash?: string | null }) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!secure,
    maxAge: SESSION_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function userFromRequest(req: Request): Promise<any | null> {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sign(body), sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.u || !payload.e || payload.e < Date.now()) return null;
    const user = await getUserByUid(payload.u);
    if (!user) return null;
    // Changing a password signs everyone else out of that account
    if (payload.p !== pwStamp(user.passwordHash)) return null;
    return user;
  } catch {
    return null;
  }
}

export const getAuthUser = (req: Request): any | null => (req as any).authUser || null;
export const isAdminReq = (req: Request): boolean => getAuthUser(req)?.role === 'admin';

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    (req as any).authUser = await userFromRequest(req);
  } catch {
    (req as any).authUser = null;
  }
  next();
}

// ---------------------------------------------------------------- route rules
type Level = 'public' | 'login' | 'member' | 'admin';
type Rule = [string, RegExp, Level];

// First match wins. Anything not listed needs a signed-in, approved, non-suspended member.
const RULES: Rule[] = [
  // Public: needed before anyone can log in, plus read-only media
  ['GET', /^\/api\/(status|health|banner|maintenance)$/, 'public'],
  ['GET', /^\/api\/admin\/banner$/, 'public'],
  // OAuth callback is protected by one-time, HMAC-signed state created by the admin-only auth-url route.
  // Do not require the admin cookie on the callback host: cookies are origin-scoped and Google may return
  // to the canonical Render domain even when the admin started from an alternate frontend domain.
  ['GET', /^\/api\/admin\/google-drive\/oauth\/callback$/, 'public'],
  ['POST', /^\/api\/auth\/(login|register|logout)$/, 'public'],
  ['POST', /^\/api\/feedback$/, 'public'],
  ['GET', /^\/api\/(media\/(audio|cover|drive-stream)|drive\/stream)\//, 'public'],

  // Any signed-in account (even pending / suspended)
  ['*', /^\/api\/auth\/(me|change-password)/, 'login'],
  ['POST', /^\/api\/chat\/appeal$/, 'login'],

  // Regular members
  ['POST', /^\/api\/songs\/[^/]+\/play$/, 'member'],
  ['POST', /^\/api\/songs\/[^/]+\/duration$/, 'member'],
  ['POST', /^\/api\/users\/activity\/listen$/, 'member'],
  ['GET', /^\/api\/users$/, 'member'],
  ['POST', /^\/api\/chat\/threads\/[^/]+\/hide$/, 'member'],
  ['DELETE', /^\/api\/chat\/requests\/[^/]+$/, 'member'],

  // Admin only
  ['*', /^\/api\/admin\//, 'admin'],
  ['POST', /^\/api\/banner$/, 'admin'],
  ['*', /^\/api\/(upload|media)\//, 'admin'],
  ['!GET', /^\/api\/songs/, 'admin'],
  ['!GET', /^\/api\/settings\//, 'admin'],
  ['!GET', /^\/api\/popups/, 'admin'],
  ['*', /^\/api\/users\//, 'admin'],
  ['*', /^\/api\/chat\/pairing-blocks/, 'admin'],
  ['GET', /^\/api\/chat\/messages-all$/, 'admin'],
  ['POST', /^\/api\/chat\/threads\/force$/, 'admin'],
  ['PATCH', /^\/api\/chat\/threads\/[^/]+\/(terminate|reopen)$/, 'admin'],
  ['DELETE', /^\/api\/chat\/(threads|messages)\/[^/]+$/, 'admin'],
  ['PATCH', /^\/api\/chat\/requests\//, 'admin'],
];

function methodMatches(rule: string, method: string) {
  if (rule === '*') return true;
  if (rule === '!GET') return method !== 'GET';
  return rule === method;
}

export function enforcePolicy(req: Request, res: Response, next: NextFunction) {
  const url = req.originalUrl.split('?')[0].replace(/\/+$/, '');
  let level: Level = 'member';
  for (const [m, re, lvl] of RULES) {
    if (methodMatches(m, req.method) && re.test(url)) {
      level = lvl;
      break;
    }
  }
  if (level === 'public') return next();

  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Please log in again.', code: 'AUTH_REQUIRED' });
  }
  if (level === 'login') return next();
  if (level === 'admin') {
    if (user.role !== 'admin') return res.status(403).json({ success: false, error: 'Administrators only.' });
    return next();
  }
  // member
  if (user.role !== 'admin' && (!user.isApproved || user.isSuspended)) {
    return res.status(403).json({ success: false, error: 'Your account cannot do this right now.' });
  }
  next();
}

// ---------------------------------------------------------------- login throttling
const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

export function loginBlocked(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return f.count >= MAX_FAILS;
}

export function noteLoginFailure(key: string) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(key, { count: 1, first: Date.now() });
  else f.count += 1;
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}
