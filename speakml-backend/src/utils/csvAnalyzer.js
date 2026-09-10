// Section 10 requirements: detect duplicate column names, inspect
// row/column count, calculate missing-value info, don't load huge files
// entirely into memory. We use csv-parse's streaming API so a 500MB CSV
// is processed row-by-row instead of being read into one giant string.

const fs = require('fs');
const { parse } = require('csv-parse');
const ApiError = require('./ApiError');

/**
 * Streams the whole file once, computing header info + missing-value
 * counts + row count. O(1) memory relative to file size (aside from the
 * small per-column counters).
 */
function analyzeCsv(absoluteFilePath) {
  return new Promise((resolve, reject) => {
    let columns = null;
    let rowCount = 0;
    let missingCounts = {};
    let duplicateColumns = [];

    const parser = fs.createReadStream(absoluteFilePath).pipe(
      parse({ bom: true, skip_empty_lines: true, relax_column_count: true })
    );

    parser.on('data', (record) => {
      if (columns === null) {
        columns = record.map((c) => String(c).trim());

        const seen = new Set();
        for (const col of columns) {
          if (seen.has(col)) duplicateColumns.push(col);
          seen.add(col);
        }
        for (const col of columns) missingCounts[col] = 0;
        return; // header row, not a data row
      }

      rowCount += 1;
      columns.forEach((col, i) => {
        const value = record[i];
        if (value === undefined || value === null || String(value).trim() === '') {
          missingCounts[col] += 1;
        }
      });
    });

    parser.on('error', (err) => reject(err));

    parser.on('end', () => {
      if (columns === null) {
        return reject(ApiError.badRequest('DATASET_INVALID', 'CSV file is empty or has no header row.'));
      }
      if (rowCount === 0) {
        return reject(ApiError.badRequest('DATASET_INVALID', 'CSV file has a header but no data rows.'));
      }
      const totalMissingValues = Object.values(missingCounts).reduce((a, b) => a + b, 0);
      resolve({
        columns,
        rowCount,
        columnCount: columns.length,
        missingValueCounts: missingCounts,
        totalMissingValues,
        duplicateColumns: [...new Set(duplicateColumns)],
      });
    });
  });
}

/**
 * Reads only the first `limit` data rows for a lightweight preview —
 * stops reading the stream immediately after, so a multi-GB file still
 * returns instantly (section 11: "do not return an entire massive CSV").
 */
function previewCsv(absoluteFilePath, limit = 10) {
  return new Promise((resolve, reject) => {
    let columns = null;
    const rows = [];

    const stream = fs.createReadStream(absoluteFilePath);
    const parser = stream.pipe(parse({ bom: true, skip_empty_lines: true, relax_column_count: true }));

    parser.on('data', (record) => {
      if (columns === null) {
        columns = record.map((c) => String(c).trim());
        return;
      }
      if (rows.length < limit) {
        const rowObj = {};
        columns.forEach((col, i) => (rowObj[col] = record[i]));
        rows.push(rowObj);
      } else {
        parser.destroy(); // stop reading — we have enough for a preview
        stream.destroy();
      }
    });

    parser.on('close', () => resolve({ columns: columns || [], rows }));
    parser.on('error', (err) => {
      // 'close' after destroy() can also emit an aborted-stream error —
      // ignore it if we already have what we need.
      if (columns !== null) return resolve({ columns, rows });
      reject(err);
    });
    parser.on('end', () => resolve({ columns: columns || [], rows }));
  });
}

module.exports = { analyzeCsv, previewCsv };
