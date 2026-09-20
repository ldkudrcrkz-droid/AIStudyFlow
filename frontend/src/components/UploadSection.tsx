type UploadSectionProps = {
  file: File | null;
  loading: boolean;
  error: string;
  compact?: boolean;
  onFileChange: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  onAnalyze: () => void;
};

function UploadSection({
  file,
  loading,
  error,
  compact = false,
  onFileChange,
  onAnalyze,
}: UploadSectionProps) {
  return (
    <section
      className={compact ? "hero compact" : "hero"}
    >
      <div className="hero-copy">
        <h1>What does this assignment actually ask for?</h1>

        <p>
          Upload the brief as a PDF. StudyFlow lists the
          requirements and deadlines, then answers your
          questions from the document itself.
        </p>
      </div>

      <div className="sheet upload-sheet">
        <label className="file-picker">
          <input
            type="file"
            accept="application/pdf"
            onChange={onFileChange}
          />

          <span className="file-picker-label">
            {file ? file.name : "Choose a PDF"}
          </span>

          <span className="file-picker-hint">
            {file
              ? "Choose a different file"
              : "or drop it here"}
          </span>
        </label>

        <button
          type="button"
          className="primary"
          onClick={onAnalyze}
          disabled={!file || loading}
        >
          {loading ? "Reading document…" : "Analyze PDF"}
        </button>

        {loading && (
          <>
            <div className="progress" aria-hidden="true" />

            <p className="status-note" role="status">
              This can take a few seconds for longer PDFs.
            </p>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

export default UploadSection;
