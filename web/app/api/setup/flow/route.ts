import { NextRequest, NextResponse } from 'next/server';
import { requireBearerAuth } from '@/server/auth';
import { getSetupFlowStatus } from '@/server/lore/setup/flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireBearerAuth(request);
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await getSetupFlowStatus());
  } catch (error) {
    return NextResponse.json(
      { detail: (error as Error)?.message || 'Failed to load setup flow' },
      { status: Number((error as { status?: number })?.status || 500) },
    );
  }
}
