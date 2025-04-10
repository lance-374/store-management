const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const {
  connectToSQL,
  getImportItemDetailsBySim,
  getImportItemDetails,
  insertImportItemDetails,
  getLastItemNum,       // Make sure this is included.
  insertItems,
  deleteImportItemDetail
} = require('./api/db');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Use the injected global variable for the preload script provided by Forge's Webpack plugin.
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the main window using the injected variable for the renderer entry.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(async () => {
  try {
    await connectToSQL();
  } catch (err) {
    console.error('Error connecting to SQL:', err);
  }

  // Register IPC handlers BEFORE creating the window.
  ipcMain.handle('get-import-item-details-by-sim', async (event, sim) => {
    try {
      const result = await getImportItemDetailsBySim(sim);
      return result;
    } catch (error) {
      console.error('Error in get-import-item-details-by-sim handler:', error);
      throw error;
    }
  });

  ipcMain.handle('get-import-item-details', async () => {
    try {
      const items = await getImportItemDetails();
      return items;
    } catch (error) {
      console.error('IPC: get-import-item-details error:', error);
      throw error;
    }
  });

  ipcMain.handle('insert-import-item-details', async (event, { sim, otherData }) => {
    try {
      const rowsAffected = await insertImportItemDetails(sim, otherData);
      return rowsAffected;
    } catch (error) {
      console.error('IPC: insert-import-item-details error:', error);
      throw error;
    }
  });

  // NEW: IPC handler for getLastItemNum
  ipcMain.handle('get-last-item-num', async (event) => {
    try {
      const lastItemNum = await getLastItemNum();
      return lastItemNum;
    } catch (error) {
      console.error('IPC: get-last-item-num error:', error);
      throw error;
    }
  });

  // NEW: IPC handler for insertItems
  ipcMain.handle('insert-items', async (event, items) => {
    try {
      const result = await insertItems(items);
      return result;
    } catch (error) {
      console.error('IPC: insert-items error:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-item', async (event, itemNum) => {
    try {
      const rowsAffected = await deleteImportItemDetail(itemNum);
      return rowsAffected;
    } catch (error) {
      console.error('Error in delete-item handler:', error);
      throw error;
    }
  });


  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
