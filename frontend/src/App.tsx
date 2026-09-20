import { useEffect, useRef, useState } from "react";

import Header from "./components/Header";
import UploadSection from "./components/UploadSection";
import DocumentLibrary from "./components/DocumentLibrary";
import AnalysisSection from "./components/AnalysisSection";
import AskStudyFlow from "./components/AskStudyFlow";
import ConfirmDialog from "./components/ConfirmDialog";

import {
  deleteDocument,
  getDocument,
  listDocuments,
  saveProgress,
  uploadPdf,
} from "./services/api";

import type {
  DocumentDetail,
  DocumentSummary,
} from "./types/document";

import "./App.css";

function errorMessage(
  err: unknown,
  fallback: string
): string {
  return err instanceof Error ? err.message : fallback;
}

function toSummary(
  doc: DocumentDetail
): DocumentSummary {
  return {
    id: doc.id,
    filename: doc.filename,
    createdAt: doc.createdAt,
    course: doc.analysis.course,
    title: doc.analysis.title,
    requirementsTotal: doc.analysis.requirements.length,
    requirementsDone: doc.completedRequirements.length,
  };
}

function scrollToAnalysis() {
  // Wait a tick so the analysis has rendered
  setTimeout(() => {
    document
      .getElementById("analysis")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, 50);
}

function App() {
  const [file, setFile] =
    useState<File | null>(null);

  // The document currently on screen
  const [current, setCurrent] =
    useState<DocumentDetail | null>(null);

  // Everything saved so far
  const [documents, setDocuments] =
    useState<DocumentSummary[]>([]);

  const [selectedTopic, setSelectedTopic] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  // Problems with the library (opening, deleting, saving)
  const [notice, setNotice] =
    useState("");

  const [openingId, setOpeningId] =
    useState<string | null>(null);

  // Document pending delete confirmation, if any
  const [pendingDeleteId, setPendingDeleteId] =
    useState<string | null>(null);

  const saveQueue = useRef<Promise<void>>(
    Promise.resolve()
  );

  /* Load the library once on start */

  useEffect(() => {
    let cancelled = false;

    listDocuments()
      .then((items) => {
        if (!cancelled) {
          setDocuments(items);
        }
      })
      .catch((err) => {
      
        console.error("Could not load documents:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.target;
    const picked = input.files?.[0] ?? null;

    setError("");

    if (!picked) {
      setFile(null);
      return;
    }

  
    try {
      const bytes = await picked.arrayBuffer();

      setFile(
        new File([bytes], picked.name, {
          type: "application/pdf",
        })
      );
    } catch {
      setFile(null);

      setError(
        "Your phone couldn't read this file. Save it to your device (e.g. Downloads) and choose it again."
      );
    } finally {
      // Lets the same file be picked again after an error.
      input.value = "";
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError(
        "Please select a PDF first."
      );

      return;
    }

    setLoading(true);

    setError("");

    setCurrent(null);

    setSelectedTopic(null);

    try {
      const doc = await uploadPdf(file);

      setCurrent(doc);

      setDocuments((items) => [
        toSummary(doc),
        ...items,
      ]);

      scrollToAnalysis();
    } catch (err) {
      console.error(err);

      setError(
        errorMessage(
          err,
          "Something went wrong."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async (id: string) => {
    if (id === current?.id) {
      scrollToAnalysis();

      return;
    }

    setOpeningId(id);

    setNotice("");

    try {
      const doc = await getDocument(id);

      setCurrent(doc);

      setSelectedTopic(null);

      setError("");

      scrollToAnalysis();
    } catch (err) {
      setNotice(
        errorMessage(
          err,
          "Could not open that document."
        )
      );
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleDeleteCancel = () => {
    setPendingDeleteId(null);
  };

  const handleDeleteConfirm = async () => {
    const id = pendingDeleteId;

    if (!id) {
      return;
    }

    setPendingDeleteId(null);

    setNotice("");

    try {
      await deleteDocument(id);

      setDocuments((items) =>
        items.filter((item) => item.id !== id)
      );

      if (current?.id === id) {
        setCurrent(null);

        setSelectedTopic(null);
      }
    } catch (err) {
      setNotice(
        errorMessage(
          err,
          "Could not delete that document."
        )
      );
    }
  };

  const pendingDeleteDoc = documents.find(
    (item) => item.id === pendingDeleteId
  );

  const pendingDeleteLabel =
    pendingDeleteDoc?.title ||
    pendingDeleteDoc?.filename ||
    "this document";

  const handleToggleRequirement = (
    index: number
  ) => {
    if (!current) {
      return;
    }

    const id = current.id;

    const done = new Set(
      current.completedRequirements
    );

    if (done.has(index)) {
      done.delete(index);
    } else {
      done.add(index);
    }

    const next = [...done].sort(
      (a, b) => a - b
    );

    // Update the screen right away, save in the background
    setCurrent({
      ...current,
      completedRequirements: next,
    });

    setDocuments((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              requirementsDone: next.length,
            }
          : item
      )
    );

    saveQueue.current = saveQueue.current
      .then(() => saveProgress(id, next))
      .then(() => setNotice(""))
      .catch((err) => {
        console.error(err);

        setNotice(
          errorMessage(
            err,
            "Could not save your progress."
          )
        );
      });
  };

  const handleTopicClick = (
    topic: string
  ) => {
    setSelectedTopic(
      topic
    );

    // Scroll to Ask StudyFlow
    setTimeout(() => {
      document
        .getElementById(
          "ask-studyflow"
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 50);
  };

  return (
    <main className="app">

      <div className="page">

        <Header />

        <UploadSection
          file={file}
          loading={loading}
          error={error}
          compact={current !== null}
          onFileChange={
            handleFileChange
          }
          onAnalyze={
            handleUpload
          }
        />

        {(documents.length > 0 || notice) && (
          <DocumentLibrary
            documents={documents}
            currentId={current?.id ?? null}
            openingId={openingId}
            notice={notice}
            onOpen={handleOpen}
            onDelete={handleDeleteRequest}
          />
        )}

        <ConfirmDialog
          open={pendingDeleteId !== null}
          title={`Delete "${pendingDeleteLabel}"?`}
          description="This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
        />

        {current && (
          <>

            <div id="analysis">
              <AnalysisSection
                analysis={current.analysis}
                completed={
                  current.completedRequirements
                }
                onToggleRequirement={
                  handleToggleRequirement
                }
                onTopicClick={
                  handleTopicClick
                }
              />
            </div>

            <div id="ask-studyflow">
              <AskStudyFlow
                key={current.id}
                documentId={current.id}
                selectedTopic={
                  selectedTopic
                }
                suggestedQuestions={
                  current.analysis.suggestedQuestions
                }
              />
            </div>

          </>
        )}

      </div>

    </main>
  );
}

export default App;