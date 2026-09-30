import crypto from 'crypto';
import { promisify } from 'util';
import { cookies } from 'next/headers';
import { ensureSchema, query } from './db.js';

const scryptAsync = promisify(crypto.scrypt);

export const SESSION_COOKIE = 'private_life_session';
export const SESSION_DAYS = 30;

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateUsername(username) {
  return /^[a-zA-Z0-9._-]{3,30}$/.test(username);
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString('hex') };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId) {
  await ensureSchema();
  const token = sessionToken();
  const hash = tokenHash(token);
  await query(
    `INSERT INTO private_life.sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')`,
    [userId, hash]
  );
  return token;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function currentSessionToken() {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value || null;
}

export async function getCurrentUser() {
  await ensureSchema();
  const token = await currentSessionToken();
  if (!token) return null;

  const result = await query(
    `SELECT u.id, u.username
       FROM private_life.sessions s
       JOIN private_life.users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
      LIMIT 1`,
    [tokenHash(token)]
  );

  return result.rows[0] || null;
}

export async function destroyCurrentSession() {
  await ensureSchema();
  const token = await currentSessionToken();
  if (!token) return;
  await query('DELETE FROM private_life.sessions WHERE token_hash = $1', [tokenHash(token)]);
}
