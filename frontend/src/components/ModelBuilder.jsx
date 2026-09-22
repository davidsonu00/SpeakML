import { useState } from "react";
import DatasetUpload from "./DatasetUpload";
import ModelType from "./ModelType";
import GenerateButton from "./GenerateButton";
import ResultsDisplay from "./ResultsDisplay";
import { createProject, uploadDataset, startTraining } from "../api";

function ModelBuilder({ onResult }) {
  const [modelType, setModelType] = useState("Auto");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState(null);

  const [status, setStatus] = useState("idle"); // idle | working | done | error
  const [statusMessage, setStatusMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    setError(null);
    setResult(null);

    if (!prompt.trim()) {
      setError("Please describe what you want to predict.");
      return;
    }
    if (!file) {
      setError("Please upload a dataset (CSV).");
      return;
    }

    // ModelType (Regression/Classification) isn't a separate API field —
    // the backend infers task type from the prompt text itself. Nudge the
    // wording if the user picked something other than Auto.
    let finalPrompt = prompt.trim();
    if (modelType === "Regression" && !finalPrompt.toLowerCase().includes("regression")) {
      finalPrompt += ". This is a regression problem.";
    } else if (modelType === "Classification" && !finalPrompt.toLowerCase().includes("classif")) {
      finalPrompt += ". This is a classification problem.";
    }

    try {
      setStatus("working");

      setStatusMessage("Creating project...");
      const project = await createProject(finalPrompt);

      setStatusMessage("Uploading dataset...");
      await uploadDataset(project.id, file);

      // No target column is sent — the ML service auto-detects it from
      // the CSV's own headers + the prompt wording.
      setStatusMessage("Training model (this can take a moment)...");
      const trainingRun = await startTraining(project.id);

      if (trainingRun.status !== "COMPLETED") {
        throw new Error(
          trainingRun.error?.message || `Training did not complete (status: ${trainingRun.status})`
        );
      }

      setResult(trainingRun);
      setStatus("done");
      setStatusMessage("");
      onResult?.({ ...trainingRun, projectId: project.id }); // lift result + projectId up to App
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setStatus("error");
      setStatusMessage("");
    }
  }

  return (
    <main className="model-builder">
      <section className="builder-content">
        <h1>Build Your ML Model</h1>

        <p className="subtitle">
          Describe what you want your model to do and let SpeakML handle the rest.
        </p>

        <div className="prompt-section">
          <label htmlFor="prompt">What do you want to predict?</label>

          <textarea
            id="prompt"
            placeholder="Example: Predict house prices based on area, bedrooms, location and other features..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <DatasetUpload file={file} onFileChange={setFile} />

        <ModelType modelType={modelType} setModelType={setModelType} />

        <GenerateButton onClick={handleGenerate} loading={status === "working"} />

        {status === "working" && <p className="status-message">{statusMessage}</p>}
        {error && <p className="error-message">{error}</p>}

        {result && <ResultsDisplay trainingRun={result} />}
      </section>

      <aside className="sidebar">
        <div className="info-card">
          <h3>Prompt Tips</h3>
          <p>Be specific about what you want your model to predict.</p>
        </div>

        <div className="info-card">
          <h3>Supported Formats</h3>
          <p>CSV</p>
        </div>
      </aside>
    </main>
  );
}

export default ModelBuilder;
