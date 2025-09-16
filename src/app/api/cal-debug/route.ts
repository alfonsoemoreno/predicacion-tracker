import { NextRequest, NextResponse } from "next/server";

// Simple endpoint to capture client debug logs and surface them in Vercel logs.
// Guarded by NEXT_PUBLIC_CAL_DEBUG at client side.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[CAL DEBUG API]", JSON.stringify(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[CAL DEBUG API ERROR]", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
