import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sessionMaxAge = 12 * 60 * 60;

const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
const developmentSecret = randomBytes(32);
const sessionIdPattern = /^[a-f0-9]{64}$/;

function signature(value: string) {
    const secret = process.env.MONALISA_JWT_SECRET;
    if ((!secret && process.env.NODE_ENV === 'production') || (secret && Buffer.byteLength(secret) < 32)) {
        throw new Error('Configure MONALISA_JWT_SECRET with at least 32 bytes.');
    }
    return createHmac('sha256', secret || developmentSecret).update(value).digest();
}

export function signSession(sessionId: string) {
    const expires = Math.floor(Date.now() / 1000) + sessionMaxAge;
    const payload = Buffer.from(JSON.stringify({ iss: 'monalisa', sub: sessionId, exp: expires })).toString('base64url');
    const value = header + '.' + payload;
    return value + '.' + signature(value).toString('base64url');
}

export function verifySession(token?: string) {
    if (!token || token.length > 512) return undefined;
    const [encodedHeader, payload, mac, extra] = token.split('.');
    if (extra !== undefined || encodedHeader !== header ||
        !/^[A-Za-z0-9_-]+$/.test(payload ?? '') || !/^[A-Za-z0-9_-]{43}$/.test(mac ?? '')) return undefined;

    const expected = signature(header + '.' + payload);
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected.toString('base64url')))) return undefined;

    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims?.iss === 'monalisa' && typeof claims.sub === 'string' && sessionIdPattern.test(claims.sub) &&
            Number.isSafeInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000)) return claims.sub as string;
    } catch {
        return undefined;
    }
}
