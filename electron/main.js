const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "RavensNest",
    webPreferences: {
      contextIsolation: true
    }
  });

  win.loadURL(
  "http://localhost:3000"
);

  win.webContents.openDevTools();
}

app.whenReady().then(() => {

  createWindow();

});

app.on("window-all-closed", () => {
  app.quit();
});