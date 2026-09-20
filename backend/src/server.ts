
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

import { extractPdfPages } from "./pdf.js";

import {
  analyzeDocument,
  askStudyFlow,
} from "./ai.js";

import { chunkPages } from "./chunker.js";

import {
  createEmbeddings,
} from "./embeddings.js";

import {
  retrieveRelevantChunks,
} from "./retriever.js";

import { parseAnalysis } from "./analysis.js";

import {
  DOCUMENT_COLUMNS,
  documentsRouter,
  toDetail,
} from "./documents.js";

import { supabase } from "./supabase.js";

const app = express();

const PORT = 3000;

// PDFs are uploaded straight to Supabase Storage (not through this
// server), so Vercel's 4.5 MB request limit does not apply. Keep this
// in sync with the bucket's file size limit and the frontend.
const MAX_UPLOAD_MB = 50;

// Private Supabase Storage bucket that holds PDFs until they are processed.
const UPLOAD_BUCKET = "uploads";

// Only ids this server generated are accepted as storage paths.
const UPLOAD_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/* =========================
   MIDDLEWARE
========================= */

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

/* =========================
   ROOT
========================= */

app.get("/", (_req, res) => {
  res.json({
    message:
      "StudyFlow AI backend is running.",
  });
});

/* =========================
   PDF UPLOAD (2 steps)
   1. The browser asks for a signed upload URL and sends
      the PDF straight to Supabase Storage.
   2. The browser tells us the path and we process the
      file from storage.
========================= */

app.post(
  "/api/upload-url",

  async (req, res) => {
    try {
      const filename =
        typeof req.body?.filename === "string"
          ? req.body.filename
          : "";

      if (!filename.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({
          error:
            "Only PDF files are supported",
        });
      }

      const path = `${randomUUID()}.pdf`;

      const { data, error } =
        await supabase.storage
          .from(UPLOAD_BUCKET)
          .createSignedUploadUrl(path);

      if (error || !data) {
        throw new Error(
          `Could not create upload URL: ${error?.message}`
        );
      }

      res.json({
        bucket: UPLOAD_BUCKET,
        path: data.path,
        token: data.token,
      });
    } catch (error) {
      console.error(
        "Upload URL error:",
        error
      );

      res.status(500).json({
        error:
          "Could not start the upload",
      });
    }
  }
);

app.post(
  "/api/upload",

  async (req, res) => {
    const path = req.body?.path;

    if (
      typeof path !== "string" ||
      !UPLOAD_PATH.test(path)
    ) {
      return res.status(400).json({
        error: "No PDF file uploaded",
      });
    }

    const filename =
      (typeof req.body?.filename === "string"
        ? req.body.filename.trim().slice(0, 255)
        : "") || "document.pdf";

    try {
      /* =========================
         LOAD FILE FROM STORAGE
      ========================= */

      const { data: blob, error: downloadError } =
        await supabase.storage
          .from(UPLOAD_BUCKET)
          .download(path);

      if (downloadError || !blob) {
        return res.status(400).json({
          error:
            "The uploaded file could not be found. Please try again.",
        });
      }

      if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) {
        return res.status(400).json({
          error: `PDF file is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`,
        });
      }

      const buffer = Buffer.from(
        await blob.arrayBuffer()
      );

      // Every real PDF starts with "%PDF-"
      if (
        buffer.subarray(0, 5).toString("latin1") !==
        "%PDF-"
      ) {
        return res.status(400).json({
          error:
            "Only PDF files are supported",
        });
      }

      /* =========================
         EXTRACT TEXT
      ========================= */

      const pages =
        await extractPdfPages(buffer);

      const text = pages.join("\n\n");

      if (!text.trim()) {
        return res.status(400).json({
          error:
            "No readable text was found in the PDF.",
        });
      }

      console.log(
        `Extracted ${text.length} characters`
      );

      /* =========================
         CREATE CHUNKS
      ========================= */

      const chunks =
        chunkPages(pages);

      console.log(
        `Created ${chunks.length} document chunks`
      );

      /* =========================
         EMBEDDINGS + ANALYSIS
         Independent of each other, so run
         them at the same time.
      ========================= */

      const [embeddings, rawAnalysis] =
        await Promise.all([
          createEmbeddings(
            chunks.map(
              (chunk) => chunk.text
            )
          ),
          analyzeDocument(text),
        ]);

      const analysis =
        parseAnalysis(rawAnalysis);

      console.log(
        `Created ${embeddings.length} embeddings (${
          embeddings[0]?.length ?? 0
        } dimensions)`
      );

      /* =========================
         STORE IN SUPABASE
      ========================= */

      const { data: document, error: documentError } =
        await supabase
          .from("documents")
          .insert({
            filename,
            analysis,
          })
          .select(DOCUMENT_COLUMNS)
          .single();

      if (documentError || !document) {
        throw new Error(
          `Could not create document: ${documentError?.message}`
        );
      }

      const rows = chunks.map((chunk, index) => ({
        document_id: document.id,
        chunk_index: chunk.id,
        page: chunk.page,
        content: chunk.text,
        embedding: embeddings[index] ?? [],
      }));

      for (let i = 0; i < rows.length; i += 100) {
        const { error: chunkError } = await supabase
          .from("chunks")
          .insert(rows.slice(i, i + 100));

        if (chunkError) {
          // Remove the half-saved document and any chunks
          // that were already written
          await supabase
            .from("chunks")
            .delete()
            .eq("document_id", document.id);

          await supabase
            .from("documents")
            .delete()
            .eq("id", document.id);

          throw new Error(
            `Could not save chunks: ${chunkError.message}`
          );
        }
      }

      console.log(
        `Saved document ${document.id} with ${rows.length} chunks`
      );

      /* =========================
         RESPONSE
      ========================= */

      res.status(201).json(
        toDetail(document)
      );
    } catch (error) {
      console.error(
        "PDF processing error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to process PDF",
      });
    } finally {
      // The text and embeddings are saved in the database,
      // so the original PDF is no longer needed.
      try {
        await supabase.storage
          .from(UPLOAD_BUCKET)
          .remove([path]);
      } catch (cleanupError) {
        console.error(
          "Could not delete uploaded PDF:",
          cleanupError
        );
      }
    }
  }
);

/* =========================
   DOCUMENT LIBRARY
========================= */

app.use(
  "/api/documents",
  documentsRouter
);

/* =========================
   TEST RAG RETRIEVAL
========================= */

app.post(
  "/api/retrieve",
  async (req, res) => {
    try {
      const { question, documentId } = req.body;

      if (!question) {
        return res.status(400).json({
          error: "No question provided",
        });
      }

      if (!documentId) {
        return res.status(400).json({
          error: "No documentId provided",
        });
      }

      const relevantChunks =
        await retrieveRelevantChunks(
          question,
          documentId,
          3
        );

      console.log(
        `Retrieved ${relevantChunks.length} relevant chunks`
      );

      res.json({
        question,
        results: relevantChunks.map(
          (chunk) => ({
            id: chunk.id,
            page: chunk.page,
            text: chunk.text,
          })
        ),
      });
    } catch (error) {
      console.error(
        "Retrieval error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to retrieve document chunks",
      });
    }
  }
);

/* =========================
   RAG QUESTION ANSWERING
========================= */

app.post(
  "/api/ask",

  async (req, res) => {
    try {
      const {
        question,
        documentId,
      } = req.body;

      if (!question) {
        return res.status(400).json({
          error:
            "No question provided",
        });
      }

      if (!documentId) {
        return res.status(400).json({
          error:
            "No documentId provided",
        });
      }

      /* =========================
         RETRIEVE RELEVANT CHUNKS
      ========================= */

      const relevantChunks =
        await retrieveRelevantChunks(
          question,
          documentId,
          3
        );

      console.log(
        `Retrieved ${relevantChunks.length} relevant chunks`
      );

      /* =========================
         BUILD CONTEXT
      ========================= */

      const context =
        relevantChunks
          .map(
            (chunk) =>
              `[Page ${chunk.page ?? "?"}]\n${chunk.text}`
          )
          .join("\n\n");

      /* =========================
         ASK GEMINI
      ========================= */

      const answer =
        await askStudyFlow(
          context,
          question
        );

      /* =========================
         RESPONSE
      ========================= */

      res.json({
        answer,

        sources:
          relevantChunks.map(
            (chunk) => ({
              id: chunk.id,
              page: chunk.page,
              text: chunk.text,
            })
          ),
      });
    } catch (error) {
      console.error(
        "AI question error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to answer question",
      });
    }
  }
);

/* =========================
   SERVER ERRORS
========================= */

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      "Server error:",
      error
    );

    res.status(500).json({
      error:
        "Internal server error",
    });
  }
);

/* =========================
   START SERVER
   On Vercel the platform runs the app itself,
   so only listen when running locally.
========================= */

if (!process.env.VERCEL) {
  app.listen(
    PORT,
    () => {
      console.log(
        `StudyFlow AI backend running on http://localhost:${PORT}`
      );
    }
  );
}

export default app;