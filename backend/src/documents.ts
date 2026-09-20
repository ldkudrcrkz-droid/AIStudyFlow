import { Router } from "express";

import type { Analysis } from "./analysis.js";
import { supabase } from "./supabase.js";

/* =========================
   SHAPES
========================= */

export const DOCUMENT_COLUMNS =
  "id, filename, created_at, analysis, completed_requirements";

type DocumentRow = {
  id: string;
  filename: string;
  created_at: string;
  analysis: Analysis;
  completed_requirements: number[] | null;
};

export type DocumentDetail = {
  id: string;
  filename: string;
  createdAt: string;
  analysis: Analysis;
  completedRequirements: number[];
};

export type DocumentSummary = {
  id: string;
  filename: string;
  createdAt: string;
  course: string;
  title: string;
  requirementsTotal: number;
  requirementsDone: number;
};

function completedOf(row: DocumentRow): number[] {
  return Array.isArray(row.completed_requirements)
    ? row.completed_requirements
    : [];
}

export function toDetail(row: DocumentRow): DocumentDetail {
  return {
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    analysis: row.analysis,
    completedRequirements: completedOf(row),
  };
}

function toSummary(row: DocumentRow): DocumentSummary {
  const total = row.analysis.requirements.length;

  return {
    id: row.id,
    filename: row.filename,
    createdAt: row.created_at,
    course: row.analysis.course,
    title: row.analysis.title,
    requirementsTotal: total,
    requirementsDone: completedOf(row).filter(
      (index) => index < total
    ).length,
  };
}

/* =========================
   HELPERS
========================= */

// Postgres "invalid_text_representation": the id is not a valid uuid.
const INVALID_ID = "22P02";

/*
  Accepts only a list of unique, in-range requirement indexes.
  Returns a sorted copy, or null if the input is invalid.
*/
function parseCompleted(
  value: unknown,
  total: number
): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set<number>();

  for (const item of value) {
    if (
      !Number.isInteger(item) ||
      item < 0 ||
      item >= total
    ) {
      return null;
    }

    unique.add(item);
  }

  return [...unique].sort((a, b) => a - b);
}

/* =========================
   ROUTES
========================= */

export const documentsRouter = Router();

// List saved documents, newest first.
documentsRouter.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .not("analysis", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      documents: ((data ?? []) as unknown as DocumentRow[]).map(
        toSummary
      ),
    });
  } catch (error) {
    console.error("List documents error:", error);

    res.status(500).json({
      error: "Failed to load documents",
    });
  }
});

// Load one saved document with its analysis and progress.
documentsRouter.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .eq("id", req.params.id)
      .not("analysis", "is", null)
      .maybeSingle();

    if (error && error.code !== INVALID_ID) {
      throw new Error(error.message);
    }

    if (error || !data) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    res.json(toDetail(data as unknown as DocumentRow));
  } catch (error) {
    console.error("Load document error:", error);

    res.status(500).json({
      error: "Failed to load document",
    });
  }
});

// Save which requirements are ticked off.
documentsRouter.patch("/:id/progress", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("documents")
      .select("analysis")
      .eq("id", req.params.id)
      .not("analysis", "is", null)
      .maybeSingle();

    if (error && error.code !== INVALID_ID) {
      throw new Error(error.message);
    }

    if (error || !data) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    const total = (data.analysis as Analysis).requirements
      .length;

    const completed = parseCompleted(
      req.body?.completedRequirements,
      total
    );

    if (!completed) {
      return res.status(400).json({
        error:
          "completedRequirements must be a list of valid requirement indexes",
      });
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({ completed_requirements: completed })
      .eq("id", req.params.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    res.json({ completedRequirements: completed });
  } catch (error) {
    console.error("Save progress error:", error);

    res.status(500).json({
      error: "Failed to save progress",
    });
  }
});

// Delete a document and its chunks.
documentsRouter.delete("/:id", async (req, res) => {
  try {
    // Delete chunks explicitly so this works even if the
    // foreign key is not set to ON DELETE CASCADE.
    const { error: chunkError } = await supabase
      .from("chunks")
      .delete()
      .eq("document_id", req.params.id);

    if (chunkError && chunkError.code !== INVALID_ID) {
      throw new Error(chunkError.message);
    }

    if (chunkError) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    const { data, error } = await supabase
      .from("documents")
      .delete()
      .eq("id", req.params.id)
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: "Document not found",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete document error:", error);

    res.status(500).json({
      error: "Failed to delete document",
    });
  }
});