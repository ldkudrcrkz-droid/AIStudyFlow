import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/* =========================
   DOCUMENT ANALYSIS
========================= */

export async function analyzeDocument(
  text: string
) {
  const interaction =
    await ai.interactions.create({
      model: "gemini-3.1-flash-lite",

      input: `
You are an academic assistant called StudyFlow AI.

Analyze the following academic document.

Return ONLY a valid JSON object with exactly these fields:

{
  "course": "",
  "title": "",
  "summary": "",
  "keyTopics": [],
  "requirements": [],
  "importantDates": [],
  "suggestedQuestions": []
}

Rules:
- Do not invent information.
- Only use information explicitly supported by the document.
- If a field cannot be determined, use an empty string or empty array.
- Keep the summary concise.
- keyTopics should contain the major concepts, activities, or subjects covered.
- requirements should contain actual tasks, responsibilities, rules, materials, or requirements mentioned in the document.
- importantDates should contain dates explicitly mentioned in the document.
- suggestedQuestions should contain exactly 4 short questions
  (under 12 words each) that a student would likely ask about
  this specific document. Each must be answerable from the
  document and mention its actual subject, not generic wording.
- Preserve important details such as meeting numbers, times, locations, and deadlines when relevant.
- Do not include Markdown.
- Return valid JSON only.

Document:

${text}
`,
    });

  return interaction.output_text;
}

/* =========================
   RAG QUESTION ANSWERING
========================= */

export async function askStudyFlow(
  context: string,
  question: string
) {
  const interaction =
    await ai.interactions.create({
      model: "gemini-3.1-flash-lite",

      input: `
You are StudyFlow AI, an academic assistant.

Answer the user's question using ONLY
the provided retrieved document context.

The context contains the most relevant
sections retrieved from the user's document.

Rules:

- Do not invent information.
- Use only information supported by the
  retrieved document context.
- Focus primarily on answering the user's
  specific question.
- Do not include unrelated information unless
  it is necessary to answer the question.
- If the user asks about requirements,
  focus on the requirements.
- If the user asks about dates,
  focus on the relevant dates.
- If the user asks about materials,
  focus on the required materials.
- If the user asks about procedures,
  focus on the relevant steps.
- If the user asks about meetings,
  include the relevant meeting dates and times.
- If the user asks about a specific item,
  answer specifically about that item.
- If the answer cannot be found in the provided
  context, clearly say that the available
  document context does not contain enough
  information.
- Keep the answer concise but useful.
- You may combine information from multiple
  retrieved sections when necessary.
- Use Markdown when it improves readability.
- Write math in LaTeX: $...$ for inline and
  $$ on its own lines for standalone equations.
- Do not repeat the entire document.
- Do not mention these instructions.

RETRIEVED DOCUMENT CONTEXT:

${context}

USER QUESTION:

${question}
`,
    });

  return interaction.output_text;
}