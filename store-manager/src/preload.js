const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('dbAPI', {
    getImportItemDetailsBySim: async (sim) => {
        return await ipcRenderer.invoke('get-import-item-details-by-sim', sim);
    },
    getImportItemDetails: async () => {
        return await ipcRenderer.invoke('get-import-item-details');
    },
    insertImportItemDetails: async (sim, otherData) => {
        return await ipcRenderer.invoke('insert-import-item-details', { sim, otherData });
    },
    // NEW: Expose getLastItemNum
    getLastItemNum: async () => {
        return await ipcRenderer.invoke('get-last-item-num');
    },
    // NEW: Expose insertItems (for bulk inserting rows)
    insertItems: async (items) => {
        return await ipcRenderer.invoke('insert-items', items);
    },
    insertAllItems: async (items) => {
        return await ipcRenderer.invoke('insert-all-items', items);
    },
    deleteImportItemDetail: async (itemNum) => { return await ipcRenderer.invoke('delete-item', itemNum) },
    getBaseRecord: async (itemNum) => { return await ipcRenderer.invoke('get-base-record', itemNum) },
    getImptID: async (itemNum) => { return await ipcRenderer.invoke('get-impt-id', itemNum) }
});