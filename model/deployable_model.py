"""
Auto-synthesized by SpeakML — Conversational Machine Learning Model Builder
Domain: custom:Titanic-Dataset.csv | Task: classification | Template: SVM | Held-out reward: 0.8251
Generated recipe: standard_impute | Tuned config: {"C": 0.744}
"""

import numpy as np
import pandas as pd

CSV_PATH = 'Titanic-Dataset.csv'
TARGET_COLUMN = 'Survived'


def load_data():
    df = pd.read_csv(CSV_PATH)
    y_raw = df[TARGET_COLUMN]
    X_df = pd.get_dummies(df.drop(columns=[TARGET_COLUMN]), drop_first=True)
    X = X_df.to_numpy(dtype=float)
    if y_raw.dtype == object:
        from sklearn.preprocessing import LabelEncoder
        y = LabelEncoder().fit_transform(y_raw.astype(str))
    else:
        y = y_raw.to_numpy(dtype=float)
    return X, y
from sklearn.svm import SVC as Model
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


def build_pipeline():
    model = Model(C=0.744)
    return model


def main():
    X, y = load_data()

    imputer = SimpleImputer(strategy="mean")
    X = imputer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)

    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    model = build_pipeline()
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    score = accuracy_score(y_test, preds)
    print(f"Held-out accuracy: {score:.4f}")


if __name__ == "__main__":
    main()
