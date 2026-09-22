function GenerateButton({ onClick, loading }) {
  return (
    <button className="generate-button" onClick={onClick} disabled={loading}>
      {loading ? "Generating..." : "Generate Model"}
    </button>
  );
}

export default GenerateButton;
