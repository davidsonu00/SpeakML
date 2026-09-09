"""
SpeakML — Conversational Machine Learning Model Builder
CLI entry point. Usage:

    python3 main.py "predict whether a tumor is malignant, accuracy matters most"

Or run with no argument for an interactive prompt.


Real limitations on the CSV path (worth knowing before you rely on it)
Tabular data only. No images, text, audio, or time series with sequence dependence — it treats every row as an independent sample with numeric/categorical columns. A CSV of tabular records (customers, houses, patients, transactions) works fine; a CSV of raw sentences to classify would not.
No missing-value-aware categorical encoding. pd.get_dummies will silently create a new column for every unique category string, so a column with high-cardinality text (like free-form names or IDs) will blow up into huge X — worth checking column cardinality before feeding it in.
No column type overrides. If a column that's actually categorical happens to be stored as numbers (e.g. a "region_code" column with values 1,2,3,4), it'll get treated as a regular numeric feature rather than one-hot encoded — usually harmless for tree models, less ideal for linear ones.
Single target column only — no multi-output / multi-label support.
No date/time handling — a date column would just get dropped or mangled by pd.get_dummies, not parsed into useful features.
"""

import sys
import json
import joblib
from orchestrator import run_pipeline
from synth import generate_deployable_script, generate_performance_report


def main():
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
    else:
        prompt = input("Describe the model you want to build: ").strip()

    print("=" * 70)
    print(f"PROMPT: {prompt}")
    print("=" * 70)

    global_state = run_pipeline(prompt, dac_rounds=10)

    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)
    best = global_state["best"]
    print(f"Task:              {global_state['task']}")
    print(f"Resolved dataset:  {global_state['resolved_domain']}")
    print(f"Winning template:  {best['template']}")
    print(f"Preprocessing:     {best['recipe']}")
    print(f"Tuned config:      {best['config']}")
    print(f"Held-out reward:   {best['reward']:.4f}")
    print(f"Attempts used:     {best['attempts_used']} (of {2 + 1} allowed)")

    # Save the actual fitted model object so it can be reloaded and used
    # for predictions immediately, without retraining.
    joblib.dump(global_state["_final_model"], "trained_model.pkl")
    print("\nTrained model object saved to trained_model.pkl (load with joblib.load)")

    script = generate_deployable_script(global_state)
    with open("deployable_model.py", "w") as f:
        f.write(script)
    print("Deployable training script written to deployable_model.py")

    report = generate_performance_report(global_state)
    with open("performance_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("Performance report written to performance_report.json")


if __name__ == "__main__":
    main()
