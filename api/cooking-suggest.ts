// api/cooking-suggest.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { openai } from "../openaiClient";
import { recipeSchema } from "../recipeSchema";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      ingredients,
      time_limit_minutes,
      equipment,
      servings,
      diet,
      allergies,
      skill_level,
      target_macros,
    } = req.body || {};

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({
        error: "ingredients must be a non-empty array of strings",
      });
    }

    const userPrompt = {
      ingredients,
      time_limit_minutes: time_limit_minutes ?? null,
      equipment: equipment ?? [],
      servings: servings ?? 2,
      diet: diet ?? null,
      allergies: allergies ?? [],
      skill_level: skill_level ?? "beginner",
      target_macros: target_macros ?? null,
    };

    const systemPrompt = `
You are a professional cooking assistant for a mobile app.
Your job:
- Suggest ONE recipe based on the supplied ingredients, time, equipment and constraints.
- Optimize for: flavor, simplicity, minimal dishes, and realistic home cooking.
- Respect dietary restrictions and allergies strictly.
- Adjust difficulty to the skill level.
- Use metric units (g, ml, °C).
- Include approximate nutrition per serving.
- Follow standard food safety: cook poultry to at least 74°C, don't leave perishable foods at room temp >2 hours, etc.
You must output ONLY JSON that matches the provided schema. No extra text.
    `.trim();

    const response = await openai.responses.create({
      model: "gpt-4o-mini", // or "gpt-4.1" / "gpt-4.1-mini" etc.
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPrompt) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: recipeSchema,
      },
    });

    // Responses API: find json content
    const output: any = response.output?.[0];
    const jsonBlock = output?.content?.find(
      (c: any) => c.type === "output_json" || c.type === "json"
    );
    const recipe = jsonBlock?.json ?? null;

    if (!recipe) {
      console.error("No JSON in response", JSON.stringify(response, null, 2));
      return res.status(500).json({ error: "Model did not return JSON" });
    }

    return res.status(200).json(recipe);
  } catch (err: any) {
    console.error("Cooking agent error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
