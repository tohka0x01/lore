import { NextRequest, NextResponse } from 'next/server';
import { requireBearerAuth } from '../../../../server/auth';
import { jsonContractError } from '../../../../server/lore/contracts';
import { loadLifecycleTextConfig } from '../../../../server/lore/lifecycle/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireBearerAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const config = await loadLifecycleTextConfig();
    return NextResponse.json({ guidance: config.guidance });
  } catch (error) {
    return jsonContractError(error, 'Failed to load lifecycle guidance');
  }
}
