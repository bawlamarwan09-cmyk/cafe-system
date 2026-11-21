import { sessionMaxAge, signSession, verifySession } from '../../../lib/session-jwt';
import { NextRequest, NextResponse } from 'next/server';
import { store, StoreError } from '../../../lib/store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionCookie = 'monalisa_session';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function failure(error: unknown) {
  if (error instanceof StoreError) return response({ error: error.status, message: error.message }, error.status);
  if (error instanceof SyntaxError) return response({ error: 400, message: 'Requête invalide. Vérifiez les informations saisies.' }, 400);
  if (error && typeof error === 'object' && 'meta' in error &&
      (error.meta as { code?: string } | undefined)?.code === '23505') {
    return response({ error: 409, message: 'Cette valeur est déjà utilisée. Choisissez une autre valeur.' }, 409);
  }
  console.error('Monalisa API failed', error);
  return response({ error: 500, message: 'Une erreur est survenue sur le serveur. Réessayez dans un instant.' }, 500);
}

export async function GET(req: NextRequest) {
  try {
    const token = verifySession(req.cookies.get(sessionCookie)?.value);
    if (!token) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
    const backend = await store();
    const user = await backend.session(token);
    if (!user) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
    return response(await backend.state(user, req.nextUrl.searchParams.get('date') || undefined));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (req.headers.get('origin') !== (process.env.MONALISA_ORIGIN || new URL(req.url).origin)) {
    return response({ error: 403, message: 'Cette requête n’est pas autorisée. Rechargez la page et reconnectez-vous.' }, 403);
  }
  try {
    const { path } = await context.params;
    const token = verifySession(req.cookies.get(sessionCookie)?.value);
    const isLogin = path[0] === 'login';
    if (!isLogin && !token) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
    const backend = await store();
    const user = isLogin ? null : await backend.session(token);
    if (!isLogin && !user) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: 400, message: 'Requête invalide. Vérifiez les informations saisies.' }, 400);
    if (isLogin) {
      const token = await backend.login(body.username, body.pin, String(body.username || '').toLowerCase());
      const signedToken = signSession(token);
      const authenticatedUser = await backend.session(token);
      if (!authenticatedUser) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
      const initialState = await backend.state(authenticatedUser);
      const result = response({ ok: true, state: initialState });
      result.cookies.set(sessionCookie, signedToken, {
        httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
        maxAge: sessionMaxAge, path: '/',
      });
      return result;
    }
    if (!user) return response({ error: 401, message: 'Votre session a expiré. Reconnectez-vous.' }, 401);
    if (path[0] === 'logout') {
      await backend.logout(token);
      const result = response({ ok: true });
      result.cookies.delete(sessionCookie);
      return result;
    }
    return response({ ok: true, ...await backend.action(user, path[0], body) });
  } catch (error) {
    return failure(error);
  }
}
