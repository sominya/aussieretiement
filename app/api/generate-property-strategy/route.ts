import { NextResponse } from "next/server";
import { generatePropertyStrategy } from "@/lib/ai/aiService";
import type { StrategyPayload } from "@/lib/ai/aiService";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as StrategyPayload;
    const markdown = await generatePropertyStrategy(payload);

    return NextResponse.json({ markdown });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate property strategy.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
