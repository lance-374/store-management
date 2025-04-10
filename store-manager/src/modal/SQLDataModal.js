import React, { useState, useEffect } from 'react';

// Helper: convert a column letter (e.g., "A", "B", "AA") to a zero-based column index.
function letterToIndex(letter) {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 65 + 1);
    }
    return index - 1;
}

function SQLDataModal({
    show,
    onClose,
    selectedSim,
    sqlData,
    csvSerialNumbers = [],
    csvHeaders = [],
    fileRows = [],    // Full data rows from the uploaded CSV/Excel file.
    effectiveSimColumn   // The letter of the SIM column (e.g., "B")
}) {
    // Local state for our processed ImportIDNum (the converted SIM value)
    const [importID, setImportID] = useState(selectedSim);
    // Local state to hold the SQL data locally (to update on deletion and insertion)
    const [localSqlData, setLocalSqlData] = useState(sqlData);

    useEffect(() => {
        setImportID(selectedSim);
    }, [selectedSim]);

    // When the sqlData prop changes, update our local state.
    useEffect(() => {
        setLocalSqlData(sqlData);
    }, [sqlData]);

    // Handler that converts a SIM from "SIM 23-166D" to "SIM 23-166"
    const handleConvertSim = () => {
        if (importID && /[A-Za-z]$/.test(importID)) {
            const newImportID = importID.slice(0, -1);
            setImportID(newImportID);
        }
    };

    // These are the SQL table columns you want to map from the file.
    const sqlTableColumns = ["ItemCaliber", "ItemManufacturer", "ItemValue", "ItemModel", "ItemSerialNum", "There Inventory #"];

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

    // Handler to create/upload new rows for the currently selected SIM.
    const handleCreateTable = async () => {
        try {
            // Ensure we are in the renderer process.
            if (typeof window === 'undefined' || !window.dbAPI) {
                throw new Error("dbAPI is not available in this context.");
            }
            // Get the last available ItemNum from SQL.
            const lastItemNum = await window.dbAPI.getLastItemNum(); // e.g., returns a number like 1000

            if (fileRows.length === 0) {
                alert("No file rows available.");
                return;
            }

            if (!effectiveSimColumn) {
                alert("Effective SIM column is not set. Please select a SIM column.");
                return;
            }

            // Convert the effective SIM column letter to a zero-based index.
            const simColIndex = letterToIndex(effectiveSimColumn);

            // Filter fileRows to only those rows where the SIM column value matches selectedSim.
            const filteredRows = fileRows.filter(row => {
                return row[simColIndex] && row[simColIndex].toString().trim() === selectedSim;
            });

            if (filteredRows.length === 0) {
                alert("No rows found for the selected SIM.");
                return;
            }

            let counter = 1; // start counter for new ItemNum
            // Iterate over each matching file row.
            for (const row of filteredRows) {
                let newRow = {};
                // Map each SQL column using the columnMapping.
                sqlTableColumns.forEach(sqlCol => {
                    const mappedHeader = columnMapping[sqlCol];
                    const colIndex = csvHeaders.indexOf(mappedHeader);
                    newRow[sqlCol] = (colIndex >= 0) ? row[colIndex] : null;
                });

                // Set a new unique ItemNum and assign ImportIDNum.
                newRow.ItemNum = Number(lastItemNum) + counter;
                counter++;
                newRow.ImportIDNum = importID;

                console.log("Inserting row:", newRow);
                // Insert the new row.
                await window.dbAPI.insertItems([newRow]);
                // Immediately update localSqlData to include the newly inserted row.
                setLocalSqlData(prev => [...prev, newRow]);
            }
            alert(`${filteredRows.length} row(s) inserted successfully!`);
        } catch (error) {
            console.error('Error creating table:', error);
            alert('Error creating table');
        }
    };

    // Handler to delete a row given its unique ItemNum.
    const handleDeleteRow = async (itemNum) => {
        try {
            const rowsAffected = await window.dbAPI.deleteImportItemDetail(itemNum);
            if (rowsAffected && rowsAffected > 0) {
                alert(`Row with ItemNum ${itemNum} deleted successfully!`);
                setLocalSqlData(prevData => prevData.filter(row => row.ItemNum !== itemNum));
            } else {
                alert(`No row deleted.`);
            }
        } catch (error) {
            console.error('Error deleting row:', error);
            alert('Error deleting row');
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
                    {localSqlData && localSqlData.length > 0
                        ? `SQL Data for ImportIDNum "${importID}"`
                        : `No SQL Data Found for ImportIDNum "${importID}". Create new data by mapping file columns to SQL columns.`}
                </h3>
                {localSqlData && localSqlData.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {Object.keys(localSqlData[0]).map((key) => (
                                    <th key={key} style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {key}
                                    </th>
                                ))}
                                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {localSqlData.map((row, idx) => (
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
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        <button onClick={() => handleDeleteRow(row.ItemNum)}>
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
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
                        <button
                            style={{ padding: '0.5rem 1rem', marginTop: '1rem' }}
                            onClick={handleCreateTable}
                        >
                            Upload Test Row(s)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SQLDataModal;
