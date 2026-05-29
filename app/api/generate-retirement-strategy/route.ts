import { NextResponse } from "next/server";
import { generateRetirementStrategy } from "@/lib/ai/aiService";
import type { StrategyPayload } from "@/lib/ai/aiService";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as StrategyPayload;
    const markdown = await generateRetirementStrategy(payload);

    return NextResponse.json({ markdown });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate retirement strategy.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
