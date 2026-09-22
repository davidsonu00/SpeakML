import { useState, useEffect } from "react";
import { predict, previewDataset } from "../api";

// Turns the dataset preview's sample rows into a friendly field spec per
// feature: dropdown + a sensible pre-filled default for low-cardinality
// columns (yes/no, categories), free-text number field (pre-filled with a
// sample value) for everything else. This means the user can hit Predict
// immediately with realistic defaults, and only needs to tweak the couple
// of fields they actually care about — not hand-type all 13 exact values.
function buildFieldSpecs(columns, sampleRows, target) {
  return columns
    .filter((col) => col !== target)
    .map((col) => {
      const values = sampleRows.map((r) => r[col]).filter((v) => v !== undefined && v !== null && v !== "");
      const unique = [...new Set(values)];

      if (unique.length > 0 && unique.length <= 6) {
        return { name: col, type: "select", options: unique, default: unique[0] };
      }

      // Numeric-looking column: default to the average of the sample.
      const numericValues = values.map(Number).filter((n) => !Number.isNaN(n));
      if (numericValues.length > 0) {
        const avg = Math.round(numericValues.reduce((a, b) => a + b, 0) / numericValues.length);
        return { name: col, type: "number", default: String(avg) };
      }

      return { name: col, type: "text", default: values[0] || "" };
    });
}

// Regression predictions come back as raw floats with long decimal tails
// (e.g. 4534434.2087652). Round + comma-format for readability;
// classification predictions (labels) are shown as-is.
function formatPredictionValue(value, taskType) {
  if (typeof value !== "number") return String(value);
  if (taskType === "classification") return String(value);
  return Math.round(value).toLocaleString();
}

function TestModel({ result, onGoToBuilder }) {
  const [fields, setFields] = useState(null); // null = loading
  const [loadedProjectId, setLoadedProjectId] = useState(null);
  const [values, setValues] = useState({});
  const [loadError, setLoadError] = useState(null);

  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!result?.projectId) return;

    let cancelled = false;
    previewDataset(result.projectId)
      .then((preview) => {
        if (cancelled) return;
        const target = result.problem?.target || result.target_column;
        const specs = buildFieldSpecs(preview.columns, preview.sampleRows, target);
        setFields(specs);
        setLoadedProjectId(result.projectId);
        setLoadError(null);
        setValues(Object.fromEntries(specs.map((f) => [f.name, f.default])));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message || "Could not load dataset columns.");
        setLoadedProjectId(result.projectId);
        setFields([]);
      });

    return () => {
      cancelled = true;
    };
  }, [result]);

  if (!result) {
    return (
      <main className="simple-page">
        <div className="empty-state">
          <h2>No trained model yet</h2>
          <p>Generate a model first, then come back here to test it.</p>
          <button className="generate-button" onClick={onGoToBuilder}>
            Go to Model Builder
          </button>
        </div>
      </main>
    );
  }

  async function handlePredict() {
    setError(null);
    setPrediction(null);

    const inputs = {};
    for (const [name, raw] of Object.entries(values)) {
      if (raw === "" || raw === undefined) continue;
      const numeric = Number(raw);
      inputs[name] = Number.isNaN(numeric) ? raw : numeric;
    }

    if (Object.keys(inputs).length === 0) {
      setError("Fill in at least one feature value.");
      return;
    }

    try {
      setLoading(true);
      const res = await predict(result.id, inputs);
      setPrediction(res);
    } catch (err) {
      setError(err.message || "Prediction failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple-page">
      <h1>Test Your Model</h1>
      <p className="subtitle">
        Model: <strong>{result.model?.algorithm}</strong> predicting{" "}
        <strong>{result.problem?.target || result.target_column}</strong>
      </p>

      <div className="test-form">
        {loadedProjectId !== result.projectId && <p className="field-hint">Loading feature list...</p>}

        {loadError && (
          <p className="field-hint">
            Couldn't auto-load column names ({loadError}).
          </p>
        )}

        {loadedProjectId === result.projectId && fields && fields.length > 0 && (
          <>
            <p className="field-hint">
              Fields are pre-filled with typical values from your dataset — adjust
              whichever ones you want to test, then hit Predict.
            </p>
            {fields.map((field) => (
              <div className="test-row-single" key={field.name}>
                <label>{field.name}</label>
                {field.type === "select" ? (
                  <select
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  >
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[field.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </>
        )}

        {loadedProjectId === result.projectId && fields && fields.length === 0 && !loadError && (
          <p className="field-hint">No columns found — check your dataset upload.</p>
        )}

        <button
          className="generate-button"
          onClick={handlePredict}
          disabled={loading || loadedProjectId !== result.projectId || !fields}
        >
          {loading ? "Predicting..." : "Predict"}
        </button>

        {error && <p className="error-message">{error}</p>}

        {prediction && (
          <div className="prediction-result">
            <strong>Predicted {result.problem?.target || result.target_column}:</strong>{" "}
            {formatPredictionValue(prediction.prediction, result.problem?.type)}
            {prediction.probability !== undefined && (
              <span> (confidence: {(prediction.probability * 100).toFixed(1)}%)</span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default TestModel;
