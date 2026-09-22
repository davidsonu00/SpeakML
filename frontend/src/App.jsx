import { useState } from "react";
import Navbar from "./components/Navbar";
import ModelBuilder from "./components/ModelBuilder";
import Results from "./components/Results";
import TestModel from "./components/TestModel";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("builder"); // builder | results | test
  const [lastResult, setLastResult] = useState(null); // most recent completed trainingRun

  return (
    <div>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "builder" && (
        <ModelBuilder
          onResult={(trainingRun) => {
            setLastResult(trainingRun);
          }}
        />
      )}

      {activeTab === "results" && (
        <Results result={lastResult} onGoToBuilder={() => setActiveTab("builder")} />
      )}

      {activeTab === "test" && (
        <TestModel result={lastResult} onGoToBuilder={() => setActiveTab("builder")} />
      )}
    </div>
  );
}

export default App;
