import { NextResponse } from 'next/server';
import { cookieOptions, createSession, hashPassword, normalizeUsername, SESSION_COOKIE, validateUsername } from '../../../../lib/auth.js';
import { ensureSchema, query } from '../../../../lib/db.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    await ensureSchema();
    const body = await request.json();
    const username = String(body?.username || '').trim();
    const usernameKey = normalizeUsername(username);
    const password = String(body?.password || '');

    if (usernameKey === normalizeUsername(process.env.ADMIN_USERNAME || 'admin')) {
      return NextResponse.json({ error: 'Ese nombre de usuario está reservado.' }, { status: 409 });
    }

    if (!validateUsername(username)) {
      return NextResponse.json({ error: 'El usuario debe tener entre 3 y 30 caracteres y usar solo letras, números, punto, guion o guion bajo.' }, { status: 400 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'La contraseña debe tener entre 8 y 128 caracteres.' }, { status: 400 });
    }

    const { salt, hash } = await hashPassword(password);
    let user;
    try {
      const inserted = await query(
        `INSERT INTO private_life.users (username, username_key, password_salt, password_hash, last_login_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, username`,
        [username, usernameKey, salt, hash]
      );
      user = inserted.rows[0];
    } catch (error) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Ese nombre de usuario ya existe.' }, { status: 409 });
      }
      throw error;
    }

    const token = await createSession(user.id);
    const response = NextResponse.json({ user: { username: user.username } }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return response;
  } catch (error) {
    console.error('register_failed', error);
    return NextResponse.json({ error: 'No se pudo crear la cuenta.' }, { status: 500 });
  }
}
