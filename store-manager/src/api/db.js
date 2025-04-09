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

// NEW: insertItems function—insert multiple items.
// Inside your insertItems function in db.js
async function insertItems(items) {
    const pool = await connectToSQL();

    for (const item of items) {
        await pool.request()
            // Omit the itemNum input because it's an identity column.
            .input('importIDNum', sql.VarChar, item.ImportIDNum ? String(item.ImportIDNum) : '')
            .input('itemSerialNum', sql.VarChar, item.ItemSerialNum ? String(item.ItemSerialNum) : '')
            .input('itemCaliber', sql.VarChar, item.ItemCaliber ? String(item.ItemCaliber) : '')
            // Add additional inputs for your other columns as needed.
            .query(`
        INSERT INTO tblImportItemDetails 
          (ImportIDNum, ItemSerialNum, ItemCaliber)
        VALUES 
          (@importIDNum, @itemSerialNum, @itemCaliber)
      `);
    }
    return true;
}




module.exports = {
    connectToSQL,
    getImportItemDetails,
    insertImportItemDetails,
    getImportItemDetailsBySim,
    getLastItemNum,    // Expose the new function
    insertItems        // Expose the new function
};
