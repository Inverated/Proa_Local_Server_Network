// Copy the built React app into the public folder of the Node.js server
const fs = require("fs");
const path = require("path");

const reactBuildPath = path.join(__dirname, "../../proa_advisor_react/dist");
const serverPublicPath = path.join(__dirname, "../public");

// remove old build before copying
fs.rmSync(serverPublicPath, { recursive: true, force: true });

// copy the build folder to the server's public folder
fs.cpSync(reactBuildPath, serverPublicPath, { recursive: true });

console.log("\n//====================================================//\nReact build copied to server public folder.\n//====================================================//\n");