import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Helper: convert a zero-based column index to Excel-style letter(s)
function columnIndexToLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

function CSVUploader() {
    // State for storing headers (array) and data rows (array of arrays)
    const [headers, setHeaders] = useState([]);
    const [dataRows, setDataRows] = useState([]);
    // The selected SIM column is stored as a column letter (e.g., "A", "B", …)
    const [simColumn, setSimColumn] = useState('');
    // For filtering by SIM after selecting the correct column
    const [selectedSim, setSelectedSim] = useState('');
    const [error, setError] = useState(null);
    const [sheetNames, setSheetNames] = useState([]);
    const [workbook, setWorkbook] = useState(null);
    const [selectedSheet, setSelectedSheet] = useState('');

    // Auto-detect by scanning each column's cells (data rows only)
    const autoDetectSimColumn = (headerRow, rows) => {
        const numCols = headerRow.length;
        for (let col = 0; col < numCols; col++) {
            // Scan each data row for this column
            for (const row of rows) {
                const cell = row[col];
                if (cell && cell.toString().trim().toLowerCase().startsWith('sim')) {
                    return columnIndexToLetter(col);
                }
            }
        }
        return ''; // Not found
    };

    const handleFileChange = (event) => {
        // Reset state on new file selection
        setError(null);
        setHeaders([]);
        setDataRows([]);
        setSimColumn('');
        setSelectedSim('');
        setSheetNames([]);
        setWorkbook(null);
        setSelectedSheet('');

        const file = event.target.files[0];
        if (!file) return;
        const fileName = file.name.toLowerCase();

        // If CSV file, use Papa Parse with header: false (returns array of arrays)
        if (fileName.endsWith('.csv')) {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length) {
                        setError(`Error parsing CSV: ${results.errors[0].message}`);
                    } else if (results.data.length > 1) {
                        const headerRow = results.data[0];
                        const rows = results.data.slice(1);
                        setHeaders(headerRow);
                        setDataRows(rows);
                        const detected = autoDetectSimColumn(headerRow, rows);
                        if (detected) {
                            setSimColumn(detected);
                        }
                    } else {
                        setError('CSV file does not contain enough data.');
                    }
                },
            });
        }
        // If Excel file, use xlsx with header: 1 (returns an array of arrays)
        else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                setWorkbook(wb);
                const sheets = wb.SheetNames;
                setSheetNames(sheets);
                // Automatically select the first sheet if available:
                if (sheets.length > 0) {
                    setSelectedSheet(sheets[0]);
                    const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]], { header: 1, defval: '' });
                    if (jsonData.length > 1) {
                        const headerRow = jsonData[0];
                        const rows = jsonData.slice(1);
                        setHeaders(headerRow);
                        setDataRows(rows);
                        const detected = autoDetectSimColumn(headerRow, rows);
                        if (detected) {
                            setSimColumn(detected);
                        }
                    } else {
                        setError('Excel sheet does not contain enough data.');
                    }
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            setError('Unsupported file format. Please upload a CSV or Excel file.');
            return;
        }
    };

    // Handler for when the user selects a different sheet in an Excel file
    const handleSheetChange = (e) => {
        const sheetName = e.target.value;
        setSelectedSheet(sheetName);
        if (workbook) {
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
            if (jsonData.length > 1) {
                const headerRow = jsonData[0];
                const rows = jsonData.slice(1);
                setHeaders(headerRow);
                setDataRows(rows);
                const detected = autoDetectSimColumn(headerRow, rows);
                if (detected) {
                    setSimColumn(detected);
                } else {
                    setSimColumn('');
                }
            }
        }
    };

    // Handler for when the user manually selects the SIM column (by letter)
    const handleSimColumnChange = (e) => {
        setSimColumn(e.target.value);
    };

    // Handler for when the user selects a SIM value from the filter dropdown
    const handleSelectedSimChange = (e) => {
        setSelectedSim(e.target.value);
    };

    // Create options for SIM column selection based on header count.
    // We'll generate column letters for each column index.
    const simColumnOptions = headers.map((header, index) => ({
        letter: columnIndexToLetter(index),
        display: `${columnIndexToLetter(index)}${header ? ': ' + header : ''}`,
    }));

    // Group the SIM column values by name (if simColumn is selected)
    let simGroups = {};
    if (simColumn && dataRows.length > 0 && headers.length > 0) {
        const colIndex = headers.findIndex((_, i) => columnIndexToLetter(i) === simColumn);
        if (colIndex !== -1) {
            dataRows.forEach((row) => {
                const simVal = row[colIndex] ? row[colIndex].toString().trim() : '';
                if (simVal !== '') {
                    simGroups[simVal] = (simGroups[simVal] || 0) + 1;
                }
            });
        }
    }

    return (
        <div>
            <h2>File Uploader</h2>
            <p>This module allows store members to upload CSV or Excel files.</p>
            <input
                type="file"
                accept=".csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
            />

            {error && <p style={{ color: 'red' }}>{error}</p>}

            {/* If Excel file has multiple sheets, let the user choose which one */}
            {sheetNames.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <label htmlFor="sheet-select">Select Sheet: </label>
                    <select id="sheet-select" value={selectedSheet} onChange={handleSheetChange}>
                        {sheetNames.map((name, index) => (
                            <option key={index} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Dropdown for selecting the SIM column by letter */}
            {headers.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Select the SIM Number Column</h3>
                    <select value={simColumn} onChange={handleSimColumnChange}>
                        <option value="">-- Select Column --</option>
                        {simColumnOptions.map((option, index) => (
                            <option key={index} value={option.letter}>
                                {option.display}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* If SIM column is selected, show a filter dropdown based on grouped SIM values */}
            {simColumn && Object.keys(simGroups).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Filter by SIM</h3>
                    <select value={selectedSim} onChange={handleSelectedSimChange}>
                        <option value="">-- All SIMs --</option>
                        {Object.entries(simGroups).map(([sim, count]) => (
                            <option key={sim} value={sim}>
                                {sim} ({count})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Preview of rows for the selected SIM filter (if any) */}
            {simColumn && dataRows.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>
                        {selectedSim
                            ? `Preview of Rows for SIM "${selectedSim}"`
                            : `Preview of All Rows in Column "${simColumn}"`
                        }
                    </h3>
                    <ul>
                        {dataRows
                            .filter((row) => {
                                if (!selectedSim) return true;
                                const colIndex = headers.findIndex((_, i) => columnIndexToLetter(i) === simColumn);
                                return row[colIndex] && row[colIndex].toString().trim() === selectedSim;
                            })
                            .slice(0, 10)
                            .map((row, idx) => {
                                const colIndex = headers.findIndex((_, i) => columnIndexToLetter(i) === simColumn);
                                return (
                                    <li key={idx}>
                                        {row[colIndex]}
                                    </li>
                                );
                            })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default CSVUploader;
