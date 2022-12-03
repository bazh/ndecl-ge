const {ipcMain} = require('electron');

let WND;
module.exports.windowChanged = function(w) {
    WND = w;
};

module.exports.send = function(name, ...args) {
    WND.webContents.send(name, ...args);
};

module.exports.waitFor = async function(name, ...args) {
    return new Promise((done) => {
        WND.webContents.send(name, ...args);

        ipcMain.once(name, async (ev, ...data) => {
            done(...data);
        });
    });
};


module.exports.Prompt = async function(msg) {
    return await module.exports.waitFor('ndoc.Prompt', msg);
}
