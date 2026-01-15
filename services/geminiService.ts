import { GoogleGenAI, Type } from "@google/genai";
import { TreeData, Difficulty } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getTreeListPrompt = (difficulty: Difficulty) => {
  let criteria = "";
  if (difficulty === Difficulty.EASY) {
    criteria = "very common, iconic trees with distinct shapes and vibrant, classic autumn colors (e.g., Sugar Maple, English Oak, Silver Birch).";
  } else if (difficulty === Difficulty.MEDIUM) {
    criteria = "a mix of well-known regional trees and some unique ornamental species (e.g., Ginkgo Biloba, Japanese Zelkova, American Sweetgum).";
  } else {
    criteria = "rare, endemic, or harder-to-identify species with subtle features or unique habitats (e.g., Wollemi Pine, Monkey Puzzle Tree, Dawn Redwood).";
  }

  return `
    Generate 3 distinct tree species that match this difficulty criteria: ${criteria}.
    For each tree, provide:
    1. commonName
    2. scientificName
    3. autumnDescription (vivid physical description of its autumn foliage for an image prompt)
    4. springDescription (vivid physical description of its spring appearance, flowers/new leaves, for an image prompt)
    5. funFact (2 concise, fascinating sentences about its ecology, history, or uses)
    6. habitats (an array of 5-8 major geographic coordinate objects with lat and lng where they naturally grow).

    Return as a JSON array of objects.
  `;
};

export async function fetchNewTrees(difficulty: Difficulty): Promise<TreeData[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: getTreeListPrompt(difficulty),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            commonName: { type: Type.STRING },
            scientificName: { type: Type.STRING },
            autumnDescription: { type: Type.STRING },
            springDescription: { type: Type.STRING },
            funFact: { type: Type.STRING },
            habitats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ["lat", "lng"]
              }
            }
          },
          required: ["commonName", "scientificName", "autumnDescription", "springDescription", "funFact", "habitats"]
        }
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    return data.map((t: any, index: number) => ({
      ...t,
      id: `tree-${Date.now()}-${index}`
    }));
  } catch (e) {
    console.error("Failed to parse tree data", e);
    throw e;
  }
}

export async function fetchNewFunFact(commonName: string, scientificName: string): Promise<string> {
  const prompt = `Generate a single new, unique, and fascinating fun fact (maximum 2 concise sentences) about the ${commonName} (${scientificName}). Focus on its unique botanical properties, historical significance, or ecological role. Return only the fact text.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text.trim();
}

export async function generateTreeImage(description: string, season: 'autumn' | 'spring'): Promise<string> {
  const prompt = `A professional, ultra-realistic nature photograph of a single ${description}. The lighting should be natural and cinematic, showcasing the tree's unique ${season} foliage textures and vibrant colors. Natural forest or park background, 8k resolution, National Geographic style. No text in image.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: {
        aspectRatio: "16:9"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image data returned from Gemini");
}