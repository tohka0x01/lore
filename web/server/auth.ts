import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

export const CLIENT_TYPES = ['claudecode', 'openclaw', 'hermes', 'mcp', 'admin'] as const;
export type ClientType = typeof CLIENT_TYPES[number];

const CLIENT_TYPE_SET = new Set<string>(CLIENT_TYPES);

export function normalizeClientType(value: unknown): ClientType | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw || '').trim().toLowerCase();
  return CLIENT_TYPE_SET.has(text) ? (text as ClientType) : null;
}

export function getApiToken(): string {
  return process.env.API_TOKEN || '';
}

function safeEqual(a: unknown, b: unknown): boolean {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireBearerAuth(request: { headers: Headers }): NextResponse | null {
  const expectedToken = getApiToken();
  if (!expectedToken) return null;

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  const providedToken = authorization.slice('Bearer '.length).trim();
  if (!providedToken || !safeEqual(providedToken, expectedToken)) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
