import { useEffect, useState } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import "katex/dist/katex.min.css";

import {
  askStudyFlow,
  type Source,
} from "../services/api";

const defaultQuestions = [
  "What do I need to submit?",
  "When are the deadlines?",
  "What materials or tools do I need?",
  "How will this be graded?",
];

type AskStudyFlowProps = {
  documentId: string | null;
  selectedTopic: string | null;
  suggestedQuestions?: string[];
};

export default function AskStudyFlow({
  documentId,
  selectedTopic,
  suggestedQuestions,
}: AskStudyFlowProps) {
  const generated = (suggestedQuestions ?? [])
    .filter(
      (item) =>
        typeof item === "string" && item.trim() !== ""
    )
    .slice(0, 4);

  const questions =
    generated.length > 0 ? generated : defaultQuestions;

  const [question, setQuestion] = useState("");

  const [answer, setAnswer] = useState("");

  const [sources, setSources] = useState<Source[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [expandedSource, setExpandedSource] = useState<
    number | null
  >(null);

  async function handleAsk(questionOverride?: string) {
    const trimmedQuestion = (
      questionOverride ?? question
    ).trim();

    if (!trimmedQuestion || !documentId) {
      return;
    }

    setLoading(true);
    setError("");
    setAnswer("");
    setSources([]);
    setExpandedSource(null);

    try {
      const result = await askStudyFlow(
        trimmedQuestion,
        documentId
      );

      setAnswer(result.answer);
      setSources(result.sources);
      setQuestion(trimmedQuestion);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedTopic) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleAsk(`Explain this topic: ${selectedTopic}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopic]);

  return (
    <section className="ask">
      <div className="ask-head">
        <h2>Ask about this document</h2>

        <p>
          Answers come only from your PDF. The passages used
          are listed under each answer.
        </p>
      </div>

      <div className="ask-body">
        <div className="chips">
          {questions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => handleAsk(item)}
              disabled={loading}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="composer">
          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();

                handleAsk();
              }
            }}
            aria-label="Your question"
            placeholder="Type a question about the document"
            rows={3}
            disabled={loading}
          />

          <button
            type="button"
            className="primary"
            onClick={() => handleAsk()}
            disabled={loading || !question.trim()}
          >
            {loading ? "Searching…" : "Ask"}
          </button>
        </div>

        {loading && (
          <p className="pending" role="status">
            Searching the document…
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {answer && (
          <article className="sheet answer">
            <h3>Answer</h3>

            <div className="answer-content">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {answer}
              </ReactMarkdown>
            </div>
          </article>
        )}

        {sources.length > 0 && (
          <div className="sources">
            <h3>Sources</h3>

            <div>
              {sources.map((source) => {
                const expanded =
                  expandedSource === source.id;

                return (
                  <div
                    className="source-card"
                    key={source.id}
                  >
                    <button
                      type="button"
                      className="source-toggle"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedSource(
                          expanded ? null : source.id
                        )
                      }
                    >
                      <span className="source-name">
                        {source.page
                          ? `Page ${source.page}`
                          : `Passage ${source.id}`}
                      </span>

                      {!expanded && (
                        <span className="source-preview">
                          {source.text}
                        </span>
                      )}

                      {expanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>

                    {expanded && (
                      <p className="source-text">
                        {source.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}