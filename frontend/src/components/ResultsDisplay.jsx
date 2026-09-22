import { modelDownloadUrl, reportDownloadUrl, scriptDownloadUrl } from "../api";

function ResultsDisplay({ trainingRun }) {
  const { id, problem, model, metrics, artifacts } = trainingRun;

  return (
    <div className="results-section">
      <h2>Model Ready</h2>

      <div className="results-grid">
        <div>
          <strong>Task:</strong> {problem?.type}
        </div>
        <div>
          <strong>Target column:</strong> {problem?.target}
        </div>
        <div>
          <strong>Algorithm:</strong> {model?.algorithm}
        </div>
      </div>

      <h3>Metrics</h3>
      <ul className="metrics-list">
        {metrics &&
          Object.entries(metrics).map(([key, value]) => (
            <li key={key}>
              <strong>{key}:</strong>{" "}
              {value === null || value === undefined ? "—" : value}
            </li>
          ))}
      </ul>

      <div className="download-links">
        {artifacts?.modelAvailable && (
          <a href={modelDownloadUrl(id)} target="_blank" rel="noreferrer">
            Download model
          </a>
        )}
        {artifacts?.reportAvailable && (
          <a href={reportDownloadUrl(id)} target="_blank" rel="noreferrer">
            Download report
          </a>
        )}
        {artifacts?.scriptAvailable && (
          <a href={scriptDownloadUrl(id)} target="_blank" rel="noreferrer">
            Download script
          </a>
        )}
      </div>
    </div>
  );
}

export default ResultsDisplay;
