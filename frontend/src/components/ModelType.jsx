function ModelType({ modelType, setModelType }) {
  return (
    <div className="model-type-section">
      <label>Model Type</label>

      <div className="model-type-options">
        <button
          className={`model-type-button ${
            modelType === "Auto" ? "active" : ""
          }`}
          onClick={() => setModelType("Auto")}
        >
          Auto
        </button>

        <button
          className={`model-type-button ${
            modelType === "Regression" ? "active" : ""
          }`}
          onClick={() => setModelType("Regression")}
        >
          Regression
        </button>

        <button
          className={`model-type-button ${
            modelType === "Classification" ? "active" : ""
          }`}
          onClick={() => setModelType("Classification")}
        >
          Classification
        </button>
      </div>

      <p className="model-type-description">
        {modelType === "Auto"
          ? "Auto lets SpeakML automatically determine the best model type based on your prompt and dataset."
          : `You selected ${modelType}. SpeakML will build a ${modelType.toLowerCase()} model.`}
      </p>
    </div>
  );
}

export default ModelType;