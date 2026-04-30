import { NextRequest, NextResponse } from 'next/server';
import { requireBearerAuth } from '../../../../../server/auth';
import { ensureRecallIndex } from '../../../../../server/lore/recall/recall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readOptionalJson(request: NextRequest): Promise<Record<string, unknown>> {
  const text = await request.text();
  return text.trim() ? JSON.parse(text) as Record<string, unknown> : {};
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireBearerAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const data = await ensureRecallIndex(await readOptionalJson(request));
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json({ detail: (error as Error)?.message || 'Recall rebuild failed' }, { status: Number((error as { status?: number })?.status || 500) });
  }
}
