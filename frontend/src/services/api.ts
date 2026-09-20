import type {
  DocumentDetail,
  DocumentSummary,
} from "../types/document";

const API_URL = "http://localhost:3000";

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

/* Upload a PDF. The server analyzes and saves it. */
export function uploadPdf(
  file: File
): Promise<DocumentDetail> {
  const formData = new FormData();

  formData.append("file", file);

  return request<DocumentDetail>(
    "/api/upload",
    {
      method: "POST",
      body: formData,
    },
    "Failed to upload PDF."
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