import React, { useState, useEffect } from 'react';

// Helper: convert a column letter (e.g., "A", "B", "AA") to a zero-based column index.
function letterToIndex(letter) {
    let index = 0;
    for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 65 + 1);
    }
    return index - 1;
}

/*
  SQLFullUploadModal
  ------------------
  This modal lets the user map the CSV/Excel columns into the SQL table columns
  for the selected SIM. It only uploads data if no SQL data exists for that SIM.
  The fields being mapped are defined by sqlTableColumns.
*/
function SQLFullUploadModal({
    show,
    onClose,
    selectedSim,
    sqlData,            // Existing SQL data for the selected SIM.
    csvSerialNumbers = [],
    csvHeaders = [],
    fileRows = [],      // All file rows from the CSV/Excel upload.
    effectiveSimColumn
}) {
    // Processed ImportID: here we use the selected SIM as the ImportIDNum.
    const [importID, setImportID] = useState(selectedSim);
    // Local SQL data state to refresh after insertion.
    const [localSqlData, setLocalSqlData] = useState(sqlData);
    // Mapping state: the key names come from sqlTableColumns.
    const [columnMapping, setColumnMapping] = useState({});
    // New state to store the permit ImptID from tblImportPermit.
    const [imptIDFromDB, setImptIDFromDB] = useState("");

    console.log("Selected SIM:", selectedSim);
    console.log("Current Column Mapping:", columnMapping);

    // Define the SQL table columns to map.
    const sqlTableColumns = [
        "ImportIDNum",
        "ItemManufacturer",
        "ItemCountryOfMfg",
        "ItemType",
        "ItemCaliber",
        "ItemQty",
        "ItemValue",
        "ItemUSMilCatagory",
        "ItemModel",
        "ItemSerialNum",
        "ItemNew",
        "ItemAction",
        "ItemCustID"
    ];

    // Update the importID state if selectedSim changes.
    useEffect(() => {
        setImportID(selectedSim);
    }, [selectedSim]);

    // Update the local SQL data state if sqlData prop changes.
    useEffect(() => {
        setLocalSqlData(sqlData);
    }, [sqlData]);

    // Fetch the permit ImptID for the selected ImportIDNum.
    useEffect(() => {
        if (typeof window !== 'undefined' && window.dbAPI && selectedSim) {
            window.dbAPI.getImptID(selectedSim)
                .then(id => {
                    setImptIDFromDB(id);
                    console.log("Fetched ImptID from tblImportPermit:", id);
                })
                .catch(error => {
                    console.error("Error fetching ImptID:", error);
                });
        }
    }, [selectedSim]);

    // (Optional) Convert a SIM value like "SIM 23-166D" to "SIM 23-166" if needed.
    const handleConvertSim = () => {
        if (importID && /[A-Za-z]$/.test(importID)) {
            const newImportID = importID.slice(0, -1);
            setImportID(newImportID);
        }
    };

    // Initialize mapping if no SQL data exists and headers are available.
    useEffect(() => {
        if ((!sqlData || sqlData.length === 0) && csvHeaders.length > 0 && Object.keys(columnMapping).length === 0) {
            const initialMapping = {};
            sqlTableColumns.forEach(sqlCol => {
                // Default each SQL field to the first available CSV header.
                initialMapping[sqlCol] = csvHeaders[0] || "";
            });
            setColumnMapping(initialMapping);
        }
    }, [sqlData, csvHeaders, columnMapping, sqlTableColumns]);

    // Update the mapping when the user selects a CSV column.
    const handleMappingChange = (sqlCol, event) => {
        const value = event.target.value;
        setColumnMapping(prevMapping => ({
            ...prevMapping,
            [sqlCol]: value,
        }));
        if (sqlCol === "ItemValue") {
            console.log(`ItemValue mapping changed. New CSV/Excel column: "${value}"`);
        }
    };

    // Handler to create and upload new rows for the selected SIM.
    // It uploads only if no data exists for the selected SIM.
    const handleCreateTable = async () => {
        try {
            if (typeof window === 'undefined' || !window.dbAPI) {
                throw new Error("dbAPI is not available in this context.");
            }

            if (sqlData && sqlData.length > 0) {
                alert("Data for the selected SIM already exists. No new data will be uploaded.");
                return;
            }

            if (!fileRows || fileRows.length === 0) {
                alert("No file rows available.");
                return;
            }

            if (!effectiveSimColumn) {
                alert("Effective SIM column is not set. Please select a SIM column.");
                return;
            }

            // Log mapping details along with the effective sheet (if provided) for debugging.
            console.log("handleCreateTable triggered");
            console.log("Effective SIM Column:", effectiveSimColumn);
            console.log("Selected SIM:", selectedSim);
            console.log("Column Mapping:", columnMapping);
            console.log("Total File Rows:", fileRows.length);

            // Map fileRows into SQL format using the column mapping.
            const mappedRows = fileRows.map((row) => {
                const mappedRow = {};
                for (const [sqlCol, csvColumn] of Object.entries(columnMapping)) {
                    mappedRow[sqlCol] = row[letterToIndex(csvColumn)] || "";
                }
                // Include ImportIDNum using the selected SIM.
                mappedRow.ImportIDNum = selectedSim;
                return mappedRow;
            });
            console.log("Mapped Rows Preview:", mappedRows.slice(0, 5)); // Preview first 5 rows

            // Now, call the dbAPI to handle the insertion.
            const result = await window.dbAPI.insertAllItems(mappedRows);
            console.log("Insert result:", result);

            // Update the view by re-fetching the SQL data using getImportItemDetailsBySim.
            const newData = await window.dbAPI.getImportItemDetailsBySim(selectedSim);
            setLocalSqlData(newData);
        } catch (error) {
            console.error("Error in handleCreateTable:", error);
        }
    };

    // Handler to delete a row from the SQL table.
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
            console.error("Error deleting row:", error);
            alert("Error deleting row");
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
                {/* Display the fetched ImptID from tblImportPermit */}
                {imptIDFromDB && (
                    <h4 style={{ marginBottom: '1rem' }}>
                        Permit ID (ImptID): {imptIDFromDB}
                    </h4>
                )}
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
                            Upload Rows
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SQLFullUploadModal;
