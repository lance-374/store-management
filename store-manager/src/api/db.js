const sql = require('mssql');

const sqlConfig = {
    user: '1',
    password: 'Luger45',
    server: 'simpsonltd-fs',
    database: 'SimpsonMasterBe',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 100000,
    },
    port: 1433
};

let pool = null;

async function connectToSQL() {
    if (!pool) {
        try {
            pool = await sql.connect(sqlConfig);
            console.log('Connected to SQL database.');
        } catch (error) {
            console.error('Failed to connect to SQL:', error);
            throw error;
        }
    }
    return pool;
}

// Existing functions...
async function getImportItemDetails() {
    const pool = await connectToSQL();
    const result = await pool.request().query('SELECT * FROM tblImportItemDetails');
    return result.recordset;
}

async function insertImportItemDetails(sim, otherData) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('sim', sql.VarChar, sim)
        .input('otherData', sql.VarChar, otherData)
        .query(`
      INSERT INTO tblImportItemDetails (SimColumn, OtherDataColumn)
      VALUES (@sim, @otherData)
    `);
    return result.rowsAffected;
}

async function getImportItemDetailsBySim(sim) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('sim', sql.VarChar, sim)
        .query('SELECT * FROM tblImportItemDetails WHERE ImportIDNum = @sim');
    return result.recordset;
}

// NEW: getLastItemNum function—retrieve the maximum ItemNum from your table.
async function getLastItemNum() {
    const pool = await connectToSQL();
    const result = await pool.request().query('SELECT MAX(ItemNum) as LastItemNum FROM tblImportItemDetails');
    // If no rows exist, you might want to default to 0.
    return result.recordset[0].LastItemNum || 0;
}

async function insertItems(items) {
    const pool = await connectToSQL();

    // Ensure there are items to process.
    if (!items || items.length === 0) return true;

    // Assume all items have the same ImportIDNum.
    const originalImportIDNum = items[0].ImportIDNum;
    // Compute the base ImportID by removing the last character.
    const baseImportID = originalImportIDNum ? String(originalImportIDNum).slice(0, -1) : '';

    // STEP A: Retrieve from tblImportItemDetails all rows for the base ImportID.
    // These rows provide the allowed ItemSerialNum values and additional base fields.
    const permitResult2 = await pool.request()
        .input('baseImportID', sql.VarChar(50), baseImportID)
        .query(`
            SELECT 
                ItemSerialNum, 
                ItemType, 
                ItemCaliber, 
                ItemCountryOfMfg, 
                ItemAction,
                ItemBarrelLength,
                ItemOverallLength,
                ItemYOM,
                ShipmentID,
                ItemModel,
                ItemManufacturer,
                ItemValue
            FROM tblImportItemDetails 
            WHERE ImportIDNum = @baseImportID
        `);

    // Build an array of allowed serial numbers from the base records.
    const baseSerialNumbers = permitResult2.recordset.map(r =>
        (r.ItemSerialNum ? String(r.ItemSerialNum).trim() : '')
    );

    // STEP B: Retrieve the ImptID from tblImportPermit using the full ImportIDNum.
    const permitResult = await pool.request()
        .input('importIDNum', sql.VarChar(50), originalImportIDNum ? String(originalImportIDNum) : '')
        .query('SELECT ImptID FROM tblImportPermit WHERE ImportIDNum = @importIDNum');

    let imptID = "";
    if (permitResult.recordset.length > 0 && permitResult.recordset[0].ImptID != null) {
        imptID = String(permitResult.recordset[0].ImptID);
    }

    // STEP C: Get the current max ItemNum once (if needed for your table),
    // but for our ItemCustID we'll use our own counter.
    const currentLastItemNum = await getLastItemNum();

    // Compute the base for ItemCustID by taking the original ImportIDNum,
    // removing the "SIM " prefix (if any), and removing hyphens.
    let baseCust = "";
    if (originalImportIDNum) {
        baseCust = String(originalImportIDNum)
            .replace(/^SIM\s*/i, "")
            .replace(/-/g, "");
    }

    // Determine the starting suffix value by querying the DB for the maximum suffix already used.
    let lastSuffix = 0;
    if (baseCust) {
        // We assume the ItemCustID format is "baseCust-XX-<inventory>" where XX are two digits.
        // The SUBSTRING starts at position (length of baseCust + 2) to extract the two-digit number.
        const maxSuffixQuery = `
            SELECT MAX(CAST(SUBSTRING(ItemCustID, ${baseCust.length + 2}, 2) AS INT)) AS MaxSuffix
            FROM tblImportItemDetails
            WHERE ItemCustID LIKE '${baseCust}-%'
        `;
        const maxSuffixResult = await pool.request().query(maxSuffixQuery);
        if (maxSuffixResult.recordset &&
            maxSuffixResult.recordset[0] &&
            maxSuffixResult.recordset[0].MaxSuffix != null) {
            lastSuffix = maxSuffixResult.recordset[0].MaxSuffix;
        }
    }

    // STEP D: Iterate over all file rows (items) and insert only those whose file row's
    // ItemSerialNum (trimmed) is found in the allowed baseSerialNumbers.
    for (const item of items) {
        // Get file row's ItemSerialNum (trimmed).
        const fileSerial = item.ItemSerialNum ? String(item.ItemSerialNum).trim() : '';
        // Only process if the file's serial number is found in the allowed list.
        if (!baseSerialNumbers.includes(fileSerial)) {
            continue;
        }

        // Find the matching base record for this fileSerial.
        const matchingRecord = permitResult2.recordset.find(r =>
            r.ItemSerialNum && String(r.ItemSerialNum).trim() === fileSerial
        );
        if (!matchingRecord) {
            continue;
        }

        // Retrieve the ItemValue from the CSV row using the mapping provided.
        // Ensure we force the value to a string.
        let csvItemValue = "";
        if (item.ItemValue != null && String(item.ItemValue).trim() !== "") {
            csvItemValue = String(item.ItemValue).trim();
        }

        // Log the type and value of csvItemValue for debugging.
        console.log(`For ItemSerialNum "${fileSerial}", csvItemValue type: ${typeof csvItemValue} and value: "${csvItemValue}"`);

        // Process ItemAction: if it is "BA", convert it to "B".
        let itemAction = matchingRecord.ItemAction ? String(matchingRecord.ItemAction).trim() : "";
        if (itemAction === "BA") {
            itemAction = "B";
        }

        // Build the new row. For all fields except ItemValue and ItemAction, the data comes from the base record.
        // For ItemValue, we now explicitly use the CSV string value.
        let newRow = {
            ItemSerialNum: fileSerial,
            ItemCaliber: matchingRecord.ItemCaliber ? String(matchingRecord.ItemCaliber) : "",
            ItemManufacturer: matchingRecord.ItemManufacturer ? String(matchingRecord.ItemManufacturer) : "",
            ItemModel: matchingRecord.ItemModel ? String(matchingRecord.ItemModel) : "",
            ItemValue: String(csvItemValue), // Force as string
            ItemType: matchingRecord.ItemType ? String(matchingRecord.ItemType) : "",
            ItemCountryOfMfg: matchingRecord.ItemCountryOfMfg ? String(matchingRecord.ItemCountryOfMfg) : "",
            ItemAction: itemAction, // Use the processed value (with "BA" replaced with "B")
            ItemBarrelLength: matchingRecord.ItemBarrelLength ? String(matchingRecord.ItemBarrelLength) : "",
            ItemOverallLength: matchingRecord.ItemOverallLength ? String(matchingRecord.ItemOverallLength) : "",
            ItemYOM: matchingRecord.ItemYOM ? String(matchingRecord.ItemYOM) : "",
            ShipmentID: matchingRecord.ShipmentID ? String(matchingRecord.ShipmentID) : "",
            ImportIDNum: originalImportIDNum,
            ImptID: imptID,
            ItemNum: Number(currentLastItemNum) + lastSuffix + 1
        };

        // Retrieve the inventory value from the CSV row using the property "InventoryNo".
        let inventoryValue = "0";
        if (item.InventoryNo != null) {
            inventoryValue = String(item.InventoryNo).trim();
        }

        // Increment our local suffix counter for this insertion.
        lastSuffix++;

        // Generate ItemCustID as "BaseCust-XX-{inventoryValue}" where "XX" is derived from lastSuffix.
        const counterString = lastSuffix.toString().padStart(2, "0");
        newRow.ItemCustID = `${baseCust}-${counterString}-${inventoryValue}`;

        // Insert the new row.
        await pool.request()
            .input('importIDNum', sql.VarChar, newRow.ImportIDNum)
            .input('imptID', sql.VarChar, newRow.ImptID)
            .input('itemSerialNum', sql.VarChar, newRow.ItemSerialNum)
            .input('itemCaliber', sql.VarChar, newRow.ItemCaliber)
            .input('itemManufacturer', sql.VarChar, newRow.ItemManufacturer)
            .input('itemModel', sql.VarChar, newRow.ItemModel)
            .input('itemValue', sql.VarChar, newRow.ItemValue)
            .input('itemType', sql.VarChar, newRow.ItemType)
            .input('itemCountryOfMfg', sql.VarChar, newRow.ItemCountryOfMfg)
            .input('itemAction', sql.VarChar, newRow.ItemAction)
            .input('itemBarrelLength', sql.VarChar, newRow.ItemBarrelLength)
            .input('itemOverallLength', sql.VarChar, newRow.ItemOverallLength)
            .input('itemYOM', sql.VarChar, newRow.ItemYOM)
            .input('shipmentID', sql.VarChar, newRow.ShipmentID)
            .input('itemCustID', sql.VarChar, newRow.ItemCustID)
            .query(`
                INSERT INTO tblImportItemDetails 
                    (
                        ImportIDNum, 
                        ImptID, 
                        ItemSerialNum, 
                        ItemCaliber, 
                        ItemManufacturer, 
                        ItemModel, 
                        ItemValue,
                        ItemType, 
                        ItemCountryOfMfg, 
                        ItemAction, 
                        ItemBarrelLength, 
                        ItemOverallLength, 
                        ItemYOM, 
                        ShipmentID,
                        ItemCustID
                    )
                VALUES 
                    (
                        @importIDNum, 
                        @imptID, 
                        @itemSerialNum, 
                        @itemCaliber, 
                        @itemManufacturer, 
                        @itemModel, 
                        @itemValue,
                        @itemType, 
                        @itemCountryOfMfg, 
                        @itemAction, 
                        @itemBarrelLength, 
                        @itemOverallLength, 
                        @itemYOM, 
                        @shipmentID,
                        @itemCustID
                    )
            `);
    }

    return true;
}


async function insertAllItems(items) {
    const pool = await connectToSQL();

    // Ensure there are items to process.
    if (!items || items.length === 0) return true;

    // Get the original ImportIDNum from the CSV (assume they are all the same).
    const originalImportIDNum = items[0].ImportIDNum ? String(items[0].ImportIDNum).trim() : "";

    // Retrieve the ImptID from tblImportPermit using the full ImportIDNum.
    const permitResult = await pool.request()
        .input('importIDNum', sql.VarChar(50), originalImportIDNum)
        .query('SELECT ImptID FROM tblImportPermit WHERE ImportIDNum = @importIDNum');

    let imptID = "";
    if (permitResult.recordset.length > 0 && permitResult.recordset[0].ImptID != null) {
        imptID = String(permitResult.recordset[0].ImptID);
    }

    // Iterate over each CSV/Excel item.
    for (const item of items) {
        // Build the new row using the CSV values.
        const newRow = {
            ImportIDNum: item.ImportIDNum ? String(item.ImportIDNum).trim() : "",
            ImptID: imptID,
            ItemManufacturer: item.ItemManufacturer ? String(item.ItemManufacturer).trim() : "",
            ItemCountryOfMfg: item.ItemCountryOfMfg ? String(item.ItemCountryOfMfg).trim() : "",
            ItemType: item.ItemType ? String(item.ItemType).trim() : "",
            ItemCaliber: item.ItemCaliber ? String(item.ItemCaliber).trim() : "",
            ItemQty: item.ItemQty ? Number(item.ItemQty) : 0,
            ItemValue: item.ItemValue ? String(item.ItemValue).trim() : "",
            ItemUSMilCatagory: item.ItemUSMilCatagory ? String(item.ItemUSMilCatagory).trim() : "",
            ItemModel: item.ItemModel ? String(item.ItemModel).trim() : "",
            ItemSerialNum: item.ItemSerialNum ? String(item.ItemSerialNum).trim() : "",
            ItemNew: typeof item.ItemNew !== 'undefined' ? Boolean(item.ItemNew) : false,
            ItemAction: item.ItemAction ? String(item.ItemAction).trim() : "",
            ItemCustID: item.ItemCustID ? String(item.ItemCustID).trim() : ""
        };

        try {
            const result = await pool.request()
                .input('ImportIDNum', sql.VarChar, newRow.ImportIDNum)
                .input('imptID', sql.VarChar, newRow.ImptID)
                .input('ItemManufacturer', sql.VarChar, newRow.ItemManufacturer)
                .input('ItemCountryOfMfg', sql.VarChar, newRow.ItemCountryOfMfg)
                .input('ItemType', sql.VarChar, newRow.ItemType)
                .input('ItemCaliber', sql.VarChar, newRow.ItemCaliber)
                .input('ItemQty', sql.Int, newRow.ItemQty)
                .input('ItemValue', sql.VarChar, newRow.ItemValue)
                .input('ItemUSMilCatagory', sql.VarChar, newRow.ItemUSMilCatagory)
                .input('ItemModel', sql.VarChar, newRow.ItemModel)
                .input('ItemSerialNum', sql.VarChar, newRow.ItemSerialNum)
                .input('ItemNew', sql.Bit, newRow.ItemNew)
                .input('ItemAction', sql.VarChar, newRow.ItemAction)
                .input('ItemCustID', sql.VarChar, newRow.ItemCustID)
                .query(`
          INSERT INTO tblImportItemDetails
            (
              ImportIDNum,
              ImptID,
              ItemManufacturer,
              ItemCountryOfMfg,
              ItemType,
              ItemCaliber,
              ItemQty,
              ItemValue,
              ItemUSMilCatagory,
              ItemModel,
              ItemSerialNum,
              ItemNew,
              ItemAction,
              ItemCustID
            )
          VALUES
            (
              @ImportIDNum,
              @imptID,
              @ItemManufacturer,
              @ItemCountryOfMfg,
              @ItemType,
              @ItemCaliber,
              @ItemQty,
              @ItemValue,
              @ItemUSMilCatagory,
              @ItemModel,
              @ItemSerialNum,
              @ItemNew,
              @ItemAction,
              @ItemCustID
            )
        `);
            console.log("Inserted newRow:", newRow, "Rows affected:", result.rowsAffected);
        } catch (error) {
            console.error("Error inserting newRow:", newRow, error);
        }
    }
    return true;
}


// Retrieves allowed serial numbers and additional base fields for a given baseImportID.
// Returns an object with { baseSerialNumbers, additionalFields }
async function getBaseRecord(baseImportID) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('baseImportID', sql.VarChar(50), baseImportID)
        .query(`
            SELECT 
                ItemSerialNum, 
                ItemType, 
                ItemCaliber, 
                ItemCountryOfMfg, 
                ItemAction,
                ItemBarrelLength,
                ItemOverallLength,
                ItemYOM,
                ShipmentID,
                ItemModel,
                ItemManufacturer,
                ItemValue
            FROM tblImportItemDetails
            WHERE ImportIDNum = @baseImportID
        `);

    // Build an array of allowed serial numbers from the result.
    const baseSerialNumbers = result.recordset.map(r =>
        (r.ItemSerialNum ? String(r.ItemSerialNum).trim() : '')
    );

    // Use the first record from the result to populate additional base fields.
    let additionalFields = {};
    if (result.recordset.length > 0) {
        const row = result.recordset[0];
        additionalFields = {
            ItemCaliber: row.ItemCaliber ? String(row.ItemCaliber) : "",
            ItemManufacturer: row.ItemManufacturer ? String(row.ItemManufacturer) : "",
            ItemModel: row.ItemModel ? String(row.ItemModel) : "",
            ItemValue: row.ItemValue ? String(row.ItemValue) : "",
            itemType: row.ItemType ? String(row.ItemType) : "",
            itemCountryOfMfg: row.ItemCountryOfMfg ? String(row.ItemCountryOfMfg) : "",
            itemAction: row.ItemAction ? String(row.ItemAction) : "",
            itemBarrelLength: row.ItemBarrelLength ? String(row.ItemBarrelLength) : "",
            itemOverallLength: row.ItemOverallLength ? String(row.ItemOverallLength) : "",
            itemYOM: row.ItemYOM ? String(row.ItemYOM) : "",
            shipmentID: row.ShipmentID ? String(row.ShipmentID) : ""
        };
    }
    return { baseSerialNumbers, additionalFields };
}

// Retrieves the ImptID for the given full ImportIDNum.
// Returns a string value (or an empty string if not found).
async function getImptID(importIDNum) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('importIDNum', sql.VarChar(50), importIDNum)
        .query('SELECT ImptID FROM tblImportPermit WHERE ImportIDNum = @importIDNum');

    if (result.recordset.length > 0 && result.recordset[0].ImptID != null) {
        return String(result.recordset[0].ImptID);
    }
    return "";
}




async function deleteImportItemDetail(itemNum) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('itemNum', sql.Int, itemNum)
        .query('DELETE FROM tblImportItemDetails WHERE ItemNum = @itemNum');
    // Return the number of rows affected (first element of the array)
    return result.rowsAffected[0] || 0;
}



module.exports = {
    connectToSQL,
    getImportItemDetails,
    insertImportItemDetails,
    getImportItemDetailsBySim,
    getLastItemNum,    // Expose the new function
    insertItems,        // Expose the new function
    deleteImportItemDetail,
    getBaseRecord,     // New helper function
    getImptID,         // New helper function
    insertAllItems
};
