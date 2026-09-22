import ResultsDisplay from "./ResultsDisplay";

function Results({ result, onGoToBuilder }) {
  if (!result) {
    return (
      <main className="simple-page">
        <div className="empty-state">
          <h2>No model yet</h2>
          <p>Generate a model first, and it'll show up here.</p>
          <button className="generate-button" onClick={onGoToBuilder}>
            Go to Model Builder
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="simple-page">
      <h1>Latest Result</h1>
      <ResultsDisplay trainingRun={result} />
    </main>
  );
}

export default Results;
