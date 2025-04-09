import React, { useState, useEffect } from 'react';

function SQLDataModal({
    show,
    onClose,
    selectedSim,
    sqlData,
    csvSerialNumbers = [],
    csvHeaders = [],
    fileRows = []   // Full data rows from the uploaded CSV/Excel file.
}) {
    // Local state for our processed ImportIDNum (the converted SIM value)
    const [importID, setImportID] = useState(selectedSim);

    // Update importID when the selectedSim prop changes.
    useEffect(() => {
        setImportID(selectedSim);
    }, [selectedSim]);

    // Handler that converts a SIM from "SIM 23-166D" to "SIM 23-166"
    const handleConvertSim = () => {
        if (importID && /[A-Za-z]$/.test(importID)) {
            const newImportID = importID.slice(0, -1);
            setImportID(newImportID);
        }
    };

    // These are the SQL table columns you want to map from the file.
    const sqlTableColumns = ["ItemCaliber", "ItemManufacturer", "ItemValue", "ItemModel", "ItemSerialNum"];

    // Local state to store the user's mapping from SQL columns to CSV/Excel columns.
    const [columnMapping, setColumnMapping] = useState({});

    // Initialize the mapping if no SQL data exists and there’s header info.
    useEffect(() => {
        if ((!sqlData || sqlData.length === 0) && csvHeaders.length > 0 && Object.keys(columnMapping).length === 0) {
            const initialMapping = {};
            sqlTableColumns.forEach(sqlCol => {
                // Optionally, default each SQL field to the first available file column.
                initialMapping[sqlCol] = csvHeaders[0] || "";
            });
            setColumnMapping(initialMapping);
        }
    }, [sqlData, csvHeaders, columnMapping, sqlTableColumns]);

    // Update mapping when the user changes a select option.
    const handleMappingChange = (sqlCol, event) => {
        const value = event.target.value;
        setColumnMapping(prevMapping => ({
            ...prevMapping,
            [sqlCol]: value,
        }));
    };

    // Handler to create/upload a single new row for testing.
    // It first gets the last available ItemNum from SQL and then processes only the first row in fileRows.
    const handleCreateTable = async () => {
        try {
            // Get the last available ItemNum from SQL.
            const lastItemNum = await window.dbAPI.getLastItemNum(); // e.g., returns a number like 1000

            if (fileRows.length === 0) {
                alert("No file rows available.");
                return;
            }

            // Only process the first row for testing.
            const row = fileRows[0];
            const newRow = {};

            // For each SQL column in your mapping, extract the CSV/Excel field.
            sqlTableColumns.forEach(sqlCol => {
                const mappedHeader = columnMapping[sqlCol];
                // Find the index of the mapped header in the csvHeaders array.
                const colIndex = csvHeaders.indexOf(mappedHeader);
                newRow[sqlCol] = (colIndex >= 0) ? row[colIndex] : null;
            });

            // Set the new unique ItemNum by incrementing the last available one.
            newRow.ItemNum = Number(lastItemNum) + 1;
            // Set the ImportIDNum field (each row gets the same selected SIM).
            newRow.ImportIDNum = importID;

            console.log("Creating table with new test row:", newRow);
            // Call the API to insert the new row (wrapped in an array for compatibility with insertItems).
            const result = await window.dbAPI.insertItems([newRow]);
            alert('Test row inserted successfully!');
        } catch (error) {
            console.error('Error creating table:', error);
            alert('Error creating table');
        }
    };

    if (!show) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: 'rgba(0,0,0,0.8)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div
                style={{
                    width: '90%',
                    height: '90%',
                    backgroundColor: '#fff',
                    overflow: 'auto',
                    position: 'relative',
                    padding: '1rem',
                    boxSizing: 'border-box',
                }}
            >
                <button
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        padding: '0.5rem 1rem',
                    }}
                    onClick={onClose}
                >
                    Close
                </button>
                {/* New button to convert the SIM string */}
                <button
                    style={{
                        position: 'absolute',
                        top: 10,
                        right: 120,
                        padding: '0.5rem 1rem',
                    }}
                    onClick={handleConvertSim}
                >
                    Convert SIM
                </button>
                <h3 style={{ marginTop: '2rem' }}>
                    {sqlData && sqlData.length > 0
                        ? `SQL Data for ImportIDNum "${importID}"`
                        : `No SQL Data Found for ImportIDNum "${importID}". Create new data by mapping file columns to SQL columns.`}
                </h3>
                {sqlData && sqlData.length > 0 ? (
                    // If SQL data exists, show it (with any matching ItemSerialNum highlighted)
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {Object.keys(sqlData[0]).map((key) => (
                                    <th key={key} style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {key}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sqlData.map((row, idx) => (
                                <tr key={idx}>
                                    {Object.keys(row).map((key) => {
                                        const isMatch =
                                            key === 'ItemSerialNum' && csvSerialNumbers.includes(row[key]);
                                        return (
                                            <td
                                                key={key}
                                                style={{
                                                    border: '1px solid #ddd',
                                                    padding: '8px',
                                                    backgroundColor: isMatch ? 'green' : 'inherit',
                                                }}
                                            >
                                                {row[key]}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    // Mapping interface shown when there’s no SQL data yet.
                    <div style={{ marginTop: '2rem' }}>
                        <h4>Map CSV/Excel Columns to SQL Table Columns</h4>
                        {sqlTableColumns.map((sqlCol) => (
                            <div key={sqlCol} style={{ marginBottom: '1rem' }}>
                                <label style={{ marginRight: '1rem' }}>{sqlCol}:</label>
                                <select
                                    value={columnMapping[sqlCol] || ""}
                                    onChange={(e) => handleMappingChange(sqlCol, e)}
                                >
                                    <option value="">-- Select CSV/Excel Column --</option>
                                    {csvHeaders.map((csvCol, idx) => (
                                        <option key={idx} value={csvCol}>
                                            {csvCol}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                        {/* Use our new handler for inserting a single test row */}
                        <button
                            style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}
                            onClick={handleCreateTable}
                        >
                            Upload Test Row
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SQLDataModal;
