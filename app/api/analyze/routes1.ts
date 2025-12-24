import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { imageDataUrl } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "You are reading a question from an image.\n\n" +
                "First, determine whether the question is:\n" +
                "1) Multiple-choice (options A/B/C/D etc), OR\n" +
                "2) A descriptive / detailed question.\n\n" +
                "Rules:\n" +
                "- If it is multiple-choice:\n" +
                "  • Select ONE correct option\n" +
                "  • State the option letter clearly\n" +
                "  • Briefly explain WHY it is correct\n\n" +
                "- If it is descriptive:\n" +
                "  • Provide a clear, structured answer\n" +
                "  • Be concise but complete\n\n" +
                "- If the question is unclear or unreadable:\n" +
                "  • Say: 'I cannot clearly read the question yet. Please adjust the camera.'\n\n" +
                "Do NOT guess missing text. Do NOT hallucinate.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 300,
    });

    return NextResponse.json({
      answer: completion.choices[0].message.content,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Server error while solving question" },
      { status: 500 }
    );
  }
}
