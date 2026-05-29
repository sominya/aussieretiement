import { NextResponse } from "next/server";
import {
  generateChatbotResponse,
  type ChatbotPayload,
} from "@/lib/ai/aiService";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ChatbotPayload;
    const markdown = await generateChatbotResponse(payload);

    return NextResponse.json({ markdown });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate chatbot response.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
