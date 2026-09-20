import { X } from "lucide-react";

import type { DocumentSummary } from "../types/document";

type DocumentLibraryProps = {
  documents: DocumentSummary[];
  currentId: string | null;
  openingId: string | null;
  notice: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

function formatDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function progressLabel(doc: DocumentSummary): string {
  if (doc.requirementsTotal === 0) {
    return "No requirements";
  }

  return `${doc.requirementsDone} of ${doc.requirementsTotal} done`;
}

export default function DocumentLibrary({
  documents,
  currentId,
  openingId,
  notice,
  onOpen,
  onDelete,
}: DocumentLibraryProps) {
  return (
    <section
      className="library"
      aria-labelledby="library-title"
    >
      <div className="library-head">
        <h2 id="library-title">Your documents</h2>

        <span className="tally">
          {documents.length} saved
        </span>
      </div>

      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}

      {documents.length > 0 && (
        <ul className="doc-grid">
          {documents.map((doc) => {
            const active = doc.id === currentId;
            const label = doc.title || doc.filename;

            return (
              <li
                key={doc.id}
                className={
                  active ? "doc-card active" : "doc-card"
                }
              >
                <button
                  type="button"
                  className="doc-open"
                  onClick={() => onOpen(doc.id)}
                  disabled={openingId !== null}
                  aria-current={active ? "true" : undefined}
                >
                  {doc.course && (
                    <span className="doc-course">
                      {doc.course}
                    </span>
                  )}

                  <span className="doc-title">{label}</span>

                  <span className="doc-meta">
                    {openingId === doc.id
                      ? "Opening…"
                      : `${progressLabel(doc)} · ${formatDate(
                          doc.createdAt
                        )}`}
                  </span>
                </button>

                <button
                  type="button"
                  className="doc-delete"
                  onClick={() => onDelete(doc.id)}
                  aria-label={`Delete ${label}`}
                  disabled={openingId !== null}
                >
                  <X size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}