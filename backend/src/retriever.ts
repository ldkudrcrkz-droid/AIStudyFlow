import { GoogleGenAI } from "@google/genai";

import { supabase } from "./supabase.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export type RetrievedChunk = {
  id: number;
  page: number | null;
  text: string;
  similarity: number;
};

async function createQueryEmbedding(
  question: string
): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
    config: {
      outputDimensionality: 768,
      taskType: "RETRIEVAL_QUERY",
    },
  });

  return response.embeddings?.[0]?.values ?? [];
}

export async function retrieveRelevantChunks(
  question: string,
  documentId: string,
  topK = 3
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await createQueryEmbedding(question);

  if (queryEmbedding.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_document_id: documentId,
    match_count: topK,
  });

  if (error) {
    throw new Error(`match_chunks failed: ${error.message}`);
  }

  return (data ?? []).map(
    (row: {
      chunk_index: number;
      page: number | null;
      content: string;
      similarity: number;
    }) => ({
      id: row.chunk_index,
      page: row.page,
      text: row.content,
      similarity: row.similarity,
    })
  );
}