import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  adminUsername,
  cookieOptions,
  createAdminSession,
  createSession,
  normalizeUsername,
  SESSION_COOKIE,
  verifyAdminCredentials,
  verifyPassword,
} from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const usernameKey = normalizeUsername(body?.username);
    const password = String(body?.password || '');

    if (usernameKey === adminUsername()) {
      if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
        return NextResponse.json({ error: 'El acceso de administración no está configurado.' }, { status: 503 });
      }
      if (!verifyAdminCredentials(usernameKey, password)) {
        return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 });
      }
      const response = NextResponse.json({ user: { username: adminUsername(), role: 'admin' } });
      response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSession(), adminCookieOptions());
      response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
      return response;
    }

    await ensureSchema();
    const found = await query(
      `SELECT id, username, password_salt, password_hash
         FROM private_life.users
        WHERE username_key = $1
        LIMIT 1`,
      [usernameKey]
    );
    const user = found.rows[0];
    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos.' }, { status: 401 });
    }

    await query('UPDATE private_life.users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await query('DELETE FROM private_life.sessions WHERE expires_at <= NOW()');
    const token = await createSession(user.id);

    const response = NextResponse.json({ user: { username: user.username, role: 'player' } });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions());
    response.cookies.set(ADMIN_SESSION_COOKIE, '', { ...adminCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    console.error('login_failed', error);
    return NextResponse.json({ error: 'No se pudo iniciar sesión.' }, { status: 500 });
  }
}
