export type Analysis = {
  course: string;
  title: string;
  summary: string;
  keyTopics: string[];
  requirements: string[];
  importantDates: string[];
  suggestedQuestions: string[];
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toTextList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(toText)
    .filter((item) => item !== "");
}

/*
  Turns the raw model output into a clean Analysis.

  Models sometimes wrap JSON in Markdown fences or add a
  sentence around it, so we parse from the first "{" to the
  last "}". Every field is then coerced to the expected type,
  so whatever we store in the database always has this shape.
*/
export function parseAnalysis(raw: unknown): Analysis {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("The AI returned an empty analysis.");
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error(
      "The AI returned an analysis in an unexpected format."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The AI returned invalid JSON for the analysis.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "The AI returned an analysis in an unexpected format."
    );
  }

  const data = parsed as Record<string, unknown>;

  return {
    course: toText(data.course),
    title: toText(data.title),
    summary: toText(data.summary),
    keyTopics: toTextList(data.keyTopics),
    requirements: toTextList(data.requirements),
    importantDates: toTextList(data.importantDates),
    suggestedQuestions: toTextList(data.suggestedQuestions).slice(0, 4),
  };
}