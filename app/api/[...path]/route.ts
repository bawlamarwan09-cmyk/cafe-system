import { NextRequest, NextResponse } from 'next/server';
import { store, StoreError } from '../../../lib/store.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function failure(error: unknown) {
  if (error instanceof StoreError) return response({ error: error.status }, error.status);
  if (error instanceof SyntaxError) return response({ error: 400 }, 400);
  if (error && typeof error === 'object' && 'meta' in error &&
      (error.meta as { code?: string } | undefined)?.code === '23505') {
    return response({ error: 409 }, 409);
  }
  console.error('Monalisa API failed', error);
  return response({ error: 500 }, 500);
}

export async function GET(req: NextRequest) {
  try {
    const backend = await store();
    const user = await backend.session(req.cookies.get('monalisa_session')?.value);
    if (!user) return response({ error: 401 }, 401);
    return response(await backend.state(user, req.nextUrl.searchParams.get('date') || undefined));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (req.headers.get('origin') !== (process.env.MONALISA_ORIGIN || new URL(req.url).origin)) {
    return response({ error: 403 }, 403);
  }
  try {
    const { path } = await context.params;
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: 400 }, 400);
    const backend = await store();
    if (path[0] === 'login') {
      const token = await backend.login(body.username, body.pin, String(body.username || '').toLowerCase());
      const result = response({ ok: true });
      result.cookies.set('monalisa_session', token, {
        httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production',
        maxAge: 43200, path: '/',
      });
      return result;
    }
    const token = req.cookies.get('monalisa_session')?.value;
    const user = await backend.session(token);
    if (!user) return response({ error: 401 }, 401);
    if (path[0] === 'logout') {
      await backend.logout(token);
      const result = response({ ok: true });
      result.cookies.delete('monalisa_session');
      return result;
    }
    return response({ ok: true, ...await backend.action(user, path[0], body) });
  } catch (error) {
    return failure(error);
  }
}
