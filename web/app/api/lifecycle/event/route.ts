import { NextRequest, NextResponse } from 'next/server';

import { requireBearerAuth } from '@/server/auth';
import { jsonContractError } from '@/server/lore/contracts';
import { buildLifecycleEvent } from '@/server/lore/lifecycle/event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireBearerAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    return NextResponse.json(await buildLifecycleEvent(body || {}));
  } catch (error) {
    return jsonContractError(error, 'Lifecycle event failed');
  }
}
