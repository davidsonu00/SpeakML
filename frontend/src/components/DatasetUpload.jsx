function DatasetUpload({ file, onFileChange }) {
  function handleChange(e) {
    const selected = e.target.files?.[0] || null;
    onFileChange(selected);
  }

  return (
    <div className="dataset-section">
      <label htmlFor="dataset">Upload your dataset</label>

      <div className="upload-box">
        <input
          type="file"
          id="dataset"
          accept=".csv"
          onChange={handleChange}
        />

        {/* Backend currently only accepts .csv (see upload.js fileFilter) —
            XLSX/JSON support would need to be added server-side first. */}
        <p>Upload CSV</p>
        <span>Maximum file size: 10 MB</span>

        {file && <p className="selected-file">Selected: {file.name}</p>}
      </div>
    </div>
  );
}

export default DatasetUpload;
