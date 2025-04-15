import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import SQLDataModal from './modal/SQLDataModal';
import SQLFullUploadModal from './modal/SQLFullUploadModal';

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
    // States for file data, headers, and SQL data
    const [headers, setHeaders] = useState([]);
    const [dataRows, setDataRows] = useState([]);
    const [simColumn, setSimColumn] = useState('');
    const [overrideSerialColumn, setOverrideSerialColumn] = useState('');
    const [selectedSim, setSelectedSim] = useState('');
    const [sqlData, setSqlData] = useState([]);
    const [error, setError] = useState(null);
    const [sheetNames, setSheetNames] = useState([]);
    const [workbook, setWorkbook] = useState(null);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showFullUploadModal, setShowFullUploadModal] = useState(false);

    // Auto-detect SIM column by scanning cells in the data rows
    const autoDetectSimColumn = (headerRow, rows) => {
        const numCols = headerRow.length;
        for (let col = 0; col < numCols; col++) {
            for (const row of rows) {
                const cell = row[col];
                if (cell && cell.toString().trim().toLowerCase().startsWith('sim')) {
                    return columnIndexToLetter(col);
                }
            }
        }
        return '';
    };

    const handleFileChange = (event) => {
        // Reset all state on file change
        setError(null);
        setHeaders([]);
        setDataRows([]);
        setSimColumn('');
        setOverrideSerialColumn('');
        setSelectedSim('');
        setSqlData([]);
        setSheetNames([]);
        setWorkbook(null);
        setSelectedSheet('');

        const file = event.target.files[0];
        if (!file) return;
        const fileName = file.name.toLowerCase();

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
                        if (detected) setSimColumn(detected);
                    } else {
                        setError('CSV file does not contain enough data.');
                    }
                },
            });
        } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                setWorkbook(wb);
                const sheets = wb.SheetNames;
                setSheetNames(sheets);
                if (sheets.length > 0) {
                    setSelectedSheet(sheets[0]);
                    const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]], {
                        header: 1,
                        defval: '',
                    });
                    if (jsonData.length > 1) {
                        const headerRow = jsonData[0];
                        const rows = jsonData.slice(1);
                        setHeaders(headerRow);
                        setDataRows(rows);
                        const detected = autoDetectSimColumn(headerRow, rows);
                        if (detected) setSimColumn(detected);
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

    const handleSheetChange = (e) => {
        const sheetName = e.target.value;
        setSelectedSheet(sheetName);
        if (workbook) {
            const jsonData = XLSX.utils.sheet_to_json(
                workbook.Sheets[sheetName],
                { header: 1, defval: '' }
            );
            if (jsonData.length > 1) {
                const headerRow = jsonData[0];
                const rows = jsonData.slice(1);
                setHeaders(headerRow);
                setDataRows(rows);
                const detected = autoDetectSimColumn(headerRow, rows);
                if (detected) setSimColumn(detected);
                else setSimColumn('');
                // Reset manual override if switching sheets
                setOverrideSerialColumn('');
            }
        }
    };

    // When user selects the SIM column (from the first select)
    const handleSimColumnChange = (e) => {
        setSimColumn(e.target.value);
    };

    // Handler for manual override.
    const handleOverrideSerialColumnChange = (e) => {
        setOverrideSerialColumn(e.target.value);
    };

    // When user selects a SIM value from the filter dropdown, fetch SQL data
    const handleSelectedSimChange = async (e) => {
        const sim = e.target.value;
        setSelectedSim(sim);
        setSqlData([]);
        if (sim && window.dbAPI && window.dbAPI.getImportItemDetailsBySim) {
            try {
                const sqlResult = await window.dbAPI.getImportItemDetailsBySim(sim);
                setSqlData(sqlResult);
            } catch (err) {
                console.error('Error fetching SQL data:', err);
            }
        }
    };

    // Options for selecting the SIM column based on header count.
    const simColumnOptions = headers.map((header, index) => ({
        letter: columnIndexToLetter(index),
        display: `${columnIndexToLetter(index)}${header ? ': ' + header : ''}`,
    }));

    // Determine which column to use for SIM values.
    const effectiveSimColumn = overrideSerialColumn || simColumn;

    // Group SIM values from the file (if an effective SIM column is selected)
    let simGroups = {};
    if (effectiveSimColumn && dataRows.length > 0 && headers.length > 0) {
        const colIndex = headers.findIndex(
            (_, i) => columnIndexToLetter(i) === effectiveSimColumn
        );
        if (colIndex !== -1) {
            dataRows.forEach((row) => {
                const simVal = row[colIndex] ? row[colIndex].toString().trim() : '';
                if (simVal !== '') {
                    simGroups[simVal] = (simGroups[simVal] || 0) + 1;
                }
            });
        }
    }

    // Create a list of distinct SIM numbers from the effective column.
    const csvSerialNumbers = Object.keys(simGroups);

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

            {headers.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Select the Serial Number Column (Auto-detected)</h3>
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

            {effectiveSimColumn && Object.keys(simGroups).length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Filter by SIM Number</h3>
                    <select value={selectedSim} onChange={handleSelectedSimChange}>
                        <option value="">-- All Serial Numbers --</option>
                        {Object.entries(simGroups).map(([sim, count]) => (
                            <option key={sim} value={sim}>
                                {sim} ({count})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {headers.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Override Serial Number Column</h3>
                    <select value={overrideSerialColumn} onChange={handleOverrideSerialColumnChange}>
                        <option value="">-- Use Auto-Detected Column --</option>
                        {simColumnOptions.map((option, index) => (
                            <option key={index} value={option.letter}>
                                {option.display}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Render both buttons when file rows exist */}
            {dataRows.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                    <button onClick={() => setShowModal(true)}>Fixed Serial #s</button>
                    <button onClick={() => setShowFullUploadModal(true)}>Blanket #s</button>
                </div>
            )}

            {/* SQL Data Modal for SIM-filtered upload */}
            <SQLDataModal
                show={showModal}
                onClose={() => setShowModal(false)}
                selectedSim={selectedSim}
                sqlData={sqlData}
                csvSerialNumbers={csvSerialNumbers}
                csvHeaders={headers}
                fileRows={dataRows} // Pass the actual file rows here
                effectiveSimColumn={effectiveSimColumn}
            />

            {/* SQL Full Upload Modal for full file upload */}
            <SQLFullUploadModal
                show={showFullUploadModal}
                onClose={() => setShowFullUploadModal(false)}
                selectedSim={selectedSim}
                sqlData={sqlData}
                csvSerialNumbers={csvSerialNumbers}
                csvHeaders={headers}
                fileRows={dataRows}    // Rows come from the selected sheet
                effectiveSimColumn={effectiveSimColumn}
                selectedSheet={selectedSheet}    // Pass the selected sheet name
            />

            {effectiveSimColumn && dataRows.length > 0 && !selectedSim && (
                <div style={{ marginTop: '1rem' }}>
                    <h3>Preview of All Rows in Column "{effectiveSimColumn}"</h3>
                    <ul>
                        {dataRows.slice(0, 10).map((row, idx) => {
                            const colIndex = headers.findIndex(
                                (_, i) => columnIndexToLetter(i) === effectiveSimColumn
                            );
                            return <li key={idx}>{row[colIndex]}</li>;
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default CSVUploader;
