function DatasetUpload() {
  return (
    <div className="dataset-section">
      <label htmlFor="dataset">Upload your dataset</label>

      <div className="upload-box">
        <input
          type="file"
          id="dataset"
          accept=".csv,.xlsx,.json"
        />

        <p>Upload CSV, XLSX or JSON</p>
        <span>Maximum file size: 50 MB</span>
      </div>
    </div>
  );
}

export default DatasetUpload;