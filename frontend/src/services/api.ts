import { createClient } from "@supabase/supabase-js";

import type {
  DocumentDetail,
  DocumentSummary,
} from "../types/document";

// Same origin: Vite proxies /api to the backend in development,
// and Vercel routes /api to the backend in production.
const API_URL = "";

// PDFs go straight to Supabase Storage, so Vercel's 4.5 MB request
// limit does not apply. Keep in sync with the backend and the bucket.
const MAX_UPLOAD_MB = 50;

/* Created on first upload so a missing env var can't break the whole app. */
function getStorageClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Uploads are not configured (missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY)."
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export type Source = {
  id: number;
  page?: number | null;
  text: string;
};

export type AskResult = {
  answer: string;
  sources: Source[];
};

/* Calls the API and turns any failure into an Error with a readable message. */
async function request<T>(
  path: string,
  options: RequestInit | undefined,
  fallbackError: string
): Promise<T> {
  const response = await fetch(
    `${API_URL}${path}`,
    options
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || fallbackError
    );
  }

  return data as T;
}

/* =========================
   DOCUMENTS
========================= */

/*
  Upload a PDF in two steps:
  1. Send it straight to Supabase Storage with a one-time signed URL.
  2. Ask the server to analyze and save it.
*/
export async function uploadPdf(
  file: File
): Promise<DocumentDetail> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);

    throw new Error(
      `This PDF is ${sizeMb} MB. The limit is ${MAX_UPLOAD_MB} MB.`
    );
  }

  const storage = getStorageClient();

  const target = await request<{
    bucket: string;
    path: string;
    token: string;
  }>(
    "/api/upload-url",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        filename: file.name,
      }),
    },
    "Could not start the upload."
  );

  const { error } = await storage.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file, {
      contentType: "application/pdf",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return request<DocumentDetail>(
    "/api/upload",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        path: target.path,
        filename: file.name,
      }),
    },
    "Failed to process PDF."
  );
}

export async function listDocuments(): Promise<
  DocumentSummary[]
> {
  const data = await request<{
    documents: DocumentSummary[];
  }>(
    "/api/documents",
    undefined,
    "Failed to load your documents."
  );

  return data.documents;
}

export function getDocument(
  id: string
): Promise<DocumentDetail> {
  return request<DocumentDetail>(
    `/api/documents/${encodeURIComponent(id)}`,
    undefined,
    "Failed to open the document."
  );
}

export async function saveProgress(
  id: string,
  completedRequirements: number[]
): Promise<void> {
  await request(
    `/api/documents/${encodeURIComponent(id)}/progress`,
    {
      method: "PATCH",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        completedRequirements,
      }),
    },
    "Failed to save your progress."
  );
}

export async function deleteDocument(
  id: string
): Promise<void> {
  await request(
    `/api/documents/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Failed to delete the document."
  );
}

/* =========================
   ASK STUDYFLOW
========================= */

export async function askStudyFlow(
  question: string,
  documentId: string
): Promise<AskResult> {
  const response =
    await fetch(
      `${API_URL}/api/ask`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          question,
          documentId,
        }),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ||
        "Failed to get an answer."
    );
  }

  return {
    answer: data.answer,
    sources:
      data.sources ?? [],
  };
}