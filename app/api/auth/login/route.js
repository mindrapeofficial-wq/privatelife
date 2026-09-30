import { NextResponse } from 'next/server';
import { cookieOptions, createSession, normalizeUsername, SESSION_COOKIE, verifyPassword } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    await ensureSchema();
    const body = await request.json();
    const usernameKey = normalizeUsername(body?.username);
    const password = String(body?.password || '');

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

    const response = NextResponse.json({ user: { username: user.username } });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return response;
  } catch (error) {
    console.error('login_failed', error);
    return NextResponse.json({ error: 'No se pudo iniciar sesión.' }, { status: 500 });
  }
}
