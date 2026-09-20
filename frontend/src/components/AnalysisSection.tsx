import type { Analysis } from "../types/analysis";

type AnalysisSectionProps = {
  analysis: Analysis;
  completed: number[];
  onToggleRequirement: (index: number) => void;
  onTopicClick: (topic: string) => void;
};

function AnalysisSection({
  analysis,
  completed,
  onToggleRequirement,
  onTopicClick,
}: AnalysisSectionProps) {
  const keyTopics = analysis.keyTopics ?? [];
  const requirements = analysis.requirements ?? [];
  const importantDates = analysis.importantDates ?? [];

  const done = new Set(completed);

  return (
    <section className="analysis">
      <header className="analysis-head">
        {analysis.course && (
          <p className="course-tab">{analysis.course}</p>
        )}

        <h2>{analysis.title || "Untitled assignment"}</h2>
      </header>

      <div className="analysis-grid">
        <article className="sheet notebook">
          <section className="block">
            <h3>Summary</h3>

            <p className="read">
              {analysis.summary || "No summary was found."}
            </p>
          </section>

          <section className="block">
            <h3>Key topics</h3>

            {keyTopics.length > 0 ? (
              <>
                <p className="hint">
                  Select a topic to ask about it.
                </p>

                <ul className="topic-list">
                  {keyTopics.map((topic, index) => (
                    <li key={index}>
                      <button
                        className="topic"
                        type="button"
                        onClick={() => onTopicClick(topic)}
                      >
                        {topic}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="empty">No key topics found.</p>
            )}
          </section>

          <section className="block">
            <div className="block-head">
              <h3>Requirements</h3>

              {requirements.length > 0 && (
                <span className="tally">
                  {done.size} of {requirements.length} done
                </span>
              )}
            </div>

            {requirements.length > 0 ? (
              <ul className="checklist">
                {requirements.map((requirement, index) => (
                  <li key={index}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={done.has(index)}
                        onChange={() =>
                          onToggleRequirement(index)
                        }
                      />

                      <span className="check-text">
                        {requirement}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                No requirements found.
              </p>
            )}
          </section>
        </article>

        <aside className="dates">
          <h3>Dates</h3>

          {importantDates.length > 0 ? (
            <ul className="date-list">
              {importantDates.map((date, index) => (
                <li key={index}>{date}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              No dates were found in this document.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

export default AnalysisSection;