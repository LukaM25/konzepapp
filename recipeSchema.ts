// recipeSchema.ts
export const recipeSchema = {
  name: "Recipe",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      servings: { type: "integer" },
      total_time_minutes: { type: "integer" },
      difficulty: {
        type: "string",
        enum: ["beginner", "intermediate", "advanced"],
      },
      tags: {
        type: "array",
        items: { type: "string" },
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
          },
          required: ["name", "quantity", "unit"],
          additionalProperties: false,
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step_number: { type: "integer" },
            instruction: { type: "string" },
            tips: { type: "string" },
          },
          required: ["step_number", "instruction"],
          additionalProperties: false,
        },
      },
      nutrition: {
        type: "object",
        properties: {
          calories_per_serving: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
        required: ["calories_per_serving"],
        additionalProperties: false,
      },
    },
    required: [
      "title",
      "servings",
      "total_time_minutes",
      "difficulty",
      "ingredients",
      "steps",
    ],
    additionalProperties: false,
  },
  strict: true,
} as const;
