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
    // (These rows provide the allowed ItemSerialNum values and additional fields.)
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

    let additionalFields = {
        itemType: "",
        baseCaliber: "",
        itemCountryOfMfg: "",
        itemAction: "",
        itemBarrelLength: "",
        itemOverallLength: "",
        itemYOM: "",
        shipmentID: "",
        ItemModel: "",
        ItemManufacturer: "",
        ItemValue: ""
    };
    if (permitResult2.recordset.length > 0) {
        const permitRow = permitResult2.recordset[0];
        additionalFields = {
            itemType: permitRow.ItemType ? String(permitRow.ItemType) : "",
            baseCaliber: permitRow.ItemCaliber ? String(permitRow.ItemCaliber) : "",
            itemCountryOfMfg: permitRow.ItemCountryOfMfg ? String(permitRow.ItemCountryOfMfg) : "",
            itemAction: permitRow.ItemAction ? String(permitRow.ItemAction) : "",
            itemBarrelLength: permitRow.ItemBarrelLength ? String(permitRow.ItemBarrelLength) : "",
            itemOverallLength: permitRow.ItemOverallLength ? String(permitRow.ItemOverallLength) : "",
            itemYOM: permitRow.ItemYOM ? String(permitRow.ItemYOM) : "",
            shipmentID: permitRow.ShipmentID ? String(permitRow.ShipmentID) : "",
            ItemModel: permitRow.ItemModel ? String(permitRow.ItemModel) : "",
            ItemManufacturer: permitRow.ItemManufacturer ? String(permitRow.ItemManufacturer) : "",
            ItemValue: permitRow.ItemValue ? String(permitRow.ItemValue) : ""
        };
    }

    // STEP B: Retrieve the ImptID from tblImportPermit using the full ImportIDNum.
    const permitResult = await pool.request()
        .input('importIDNum', sql.VarChar(50), originalImportIDNum ? String(originalImportIDNum) : '')
        .query('SELECT ImptID FROM tblImportPermit WHERE ImportIDNum = @importIDNum');

    let imptID = "";
    if (permitResult.recordset.length > 0 && permitResult.recordset[0].ImptID != null) {
        imptID = String(permitResult.recordset[0].ImptID);
    }

    // STEP C: Get the current max ItemNum once, then use a counter to increment it.
    const currentLastItemNum = await getLastItemNum();
    let counter = 1;

    // Compute the base for ItemCustID by taking originalImportIDNum, removing the "SIM " prefix,
    // and then removing any hyphens.
    let baseCust = "";
    if (originalImportIDNum) {
        baseCust = String(originalImportIDNum)
            .replace(/^SIM\s*/i, "")  // remove "SIM " prefix (case-insensitive)
            .replace(/-/g, "");       // remove hyphens
    }

    // STEP D: Iterate over all file rows (items) and insert only those whose ItemSerialNum is allowed.
    for (const item of items) {
        // Get file row's ItemSerialNum (as a trimmed string).
        const fileSerial = item.ItemSerialNum ? String(item.ItemSerialNum).trim() : '';
        // Only insert if the file's serial number is present in the baseSerialNumbers list.
        if (!baseSerialNumbers.includes(fileSerial)) {
            continue;
        }

        // Build the new row using file data and additional fields.
        let newRow = {
            ItemSerialNum: fileSerial,
            // Use the baseImportID values for these fields:
            ItemCaliber: additionalFields.baseCaliber,
            ItemManufacturer: additionalFields.ItemManufacturer,
            ItemModel: additionalFields.ItemModel,
            ItemValue: additionalFields.ItemValue,
            ItemType: additionalFields.itemType,
            ItemCountryOfMfg: additionalFields.itemCountryOfMfg,
            ItemAction: additionalFields.itemAction,
            ItemBarrelLength: additionalFields.itemBarrelLength,
            ItemOverallLength: additionalFields.itemOverallLength,
            ItemYOM: additionalFields.itemYOM,
            ShipmentID: additionalFields.shipmentID,
            ImportIDNum: originalImportIDNum,
            ImptID: imptID,
            ItemNum: Number(currentLastItemNum) + counter
        };

        // Generate ItemCustID.
        // Assume each item has a property "SelectedInventory" that is the starting inventory number.
        // If not present, default to 0.
        let inventoryStart = item.SelectedInventory ? Number(item.SelectedInventory) : 0;
        // Pad the counter to two digits.
        const counterString = counter.toString().padStart(2, "0");
        newRow.ItemCustID = `${baseCust}-${counterString}-${inventoryStart + counter - 1}`;

        counter++;

        // Now insert the new row.
        await pool.request()
            .input('importIDNum', sql.VarChar(50), newRow.ImportIDNum)
            .input('imptID', sql.VarChar(50), newRow.ImptID)
            .input('itemSerialNum', sql.VarChar(50), newRow.ItemSerialNum)
            .input('itemCaliber', sql.VarChar(50), newRow.ItemCaliber)
            .input('itemManufacturer', sql.VarChar(50), newRow.ItemManufacturer)
            .input('itemModel', sql.VarChar(50), newRow.ItemModel)
            .input('itemType', sql.VarChar(50), newRow.ItemType)
            .input('itemCountryOfMfg', sql.VarChar(50), newRow.ItemCountryOfMfg)
            .input('itemAction', sql.VarChar(50), newRow.ItemAction)
            .input('itemBarrelLength', sql.VarChar(50), newRow.ItemBarrelLength)
            .input('itemOverallLength', sql.VarChar(50), newRow.ItemOverallLength)
            .input('itemYOM', sql.VarChar(50), newRow.ItemYOM)
            .input('shipmentID', sql.VarChar(50), newRow.ShipmentID)
            .input('itemCustID', sql.VarChar(50), newRow.ItemCustID)
            .query(`
      INSERT INTO tblImportItemDetails 
          (
              ImportIDNum, 
              ImptID, 
              ItemSerialNum, 
              ItemCaliber, 
              ItemManufacturer, 
              ItemModel, 
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





async function deleteImportItemDetail(itemNum) {
    const pool = await connectToSQL();
    const result = await pool.request()
        .input('itemNum', sql.Int, itemNum)
        .query('DELETE FROM tblImportItemDetails WHERE ItemNum = @itemNum');
    return result.rowsAffected;
}


module.exports = {
    connectToSQL,
    getImportItemDetails,
    insertImportItemDetails,
    getImportItemDetailsBySim,
    getLastItemNum,    // Expose the new function
    insertItems,        // Expose the new function
    deleteImportItemDetail
};
