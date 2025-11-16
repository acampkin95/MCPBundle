import { NextResponse } from 'next/server';
import { fetchPanelData } from '../../../lib/panelClient';

export async function GET() {
  try {
    const data = await fetchPanelData();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 }
    );
  }
}
