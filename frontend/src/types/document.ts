import type { Analysis } from "./analysis";

/* One row in the document library. */
export type DocumentSummary = {
  id: string;
  filename: string;
  createdAt: string;
  course: string;
  title: string;
  requirementsTotal: number;
  requirementsDone: number;
};

/* A saved document, ready to display. */
export type DocumentDetail = {
  id: string;
  filename: string;
  createdAt: string;
  analysis: Analysis;
  completedRequirements: number[];
};