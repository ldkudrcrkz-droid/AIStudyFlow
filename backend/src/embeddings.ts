import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const BATCH_SIZE = 50;

export async function createEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: batch,
      config: {
        outputDimensionality: 768,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    });

    for (const embedding of response.embeddings ?? []) {
      embeddings.push(embedding.values ?? []);
    }
  }

  return embeddings;
}