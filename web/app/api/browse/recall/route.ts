import { NextRequest, NextResponse } from 'next/server';
import { normalizeClientType, requireBearerAuth } from '../../../../server/auth';
import { recallMemories } from '../../../../server/lore/recall/recall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireBearerAuth(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const clientType = normalizeClientType(request.nextUrl.searchParams.get('client_type'));
    return NextResponse.json(await recallMemories(body, { clientType }));
  } catch (error) {
    return NextResponse.json({ detail: (error as Error)?.message || 'Recall failed' }, { status: Number((error as { status?: number })?.status || 500) });
  }
}
