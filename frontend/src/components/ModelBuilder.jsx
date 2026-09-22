import { useState } from "react";
import DatasetUpload from "./DatasetUpload";
import ModelType from "./ModelType";
import GenerateButton from "./GenerateButton";

function ModelBuilder() {
  const [modelType, setModelType] = useState("Auto");

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
          />
        </div>

        <DatasetUpload />

        <ModelType
          modelType={modelType}
          setModelType={setModelType}
        />

        <GenerateButton />
      </section>

      <aside className="sidebar">
        <div className="info-card">
          <h3>Prompt Tips</h3>
          <p>Be specific about what you want your model to predict.</p>
        </div>

        <div className="info-card">
          <h3>Supported Formats</h3>
          <p>CSV, XLSX, JSON</p>
        </div>
      </aside>
    </main>
  );
}

export default ModelBuilder;