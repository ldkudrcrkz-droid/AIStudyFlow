import "dotenv/config";

import express from "express";
import cors from "cors";
import multer from "multer";

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

/* =========================
   MIDDLEWARE
========================= */

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize:
      50 * 1024 * 1024,
  },
});

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
   PDF UPLOAD
========================= */

app.post(
  "/api/upload",
  upload.single("file"),

  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "No PDF file uploaded",
        });
      }

      if (
        req.file.mimetype !==
        "application/pdf"
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
        await extractPdfPages(
          req.file.buffer
        );

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
            filename: req.file.originalname,
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
   MULTER / SERVER ERRORS
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

    if (
      error instanceof
      multer.MulterError
    ) {
      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          error:
            "PDF file is too large. Maximum size is 50 MB.",
        });
      }
    }

    res.status(500).json({
      error:
        "Internal server error",
    });
  }
);

/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  () => {
    console.log(
      `StudyFlow AI backend running on http://localhost:${PORT}`
    );
  }
);