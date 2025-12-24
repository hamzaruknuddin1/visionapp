import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const imageDataUrl = body?.imageDataUrl;
    const mode = body?.mode ?? "quick";

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid image data" },
        { status: 400 }
      );
    }

    const prompt =
      mode === "detailed"
        ? "Describe what is happening in this image in two short sentences. Do not guess identities."
        : "Describe what is happening in this image in one short sentence. Do not guess identities.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: mode === "detailed" ? 80 : 40,
    });

    const caption =
      completion.choices[0]?.message?.content ?? "Unable to describe image.";

    return NextResponse.json({ caption });
  } catch (err: any) {
    console.error("VISION ERROR:", err);
    return NextResponse.json(
      { error: "Server error while analyzing image." },
      { status: 500 }
    );
  }
}
