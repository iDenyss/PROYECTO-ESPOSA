const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const output = path.join(root, "dist");
const defaultServerUrl = "https://arcade-swf-multiplayer.onrender.com";
const serverUrl = (process.env.ARCADE_MULTIPLAYER_SERVER || defaultServerUrl).trim().replace(/\/+$/, "");

if (serverUrl) {
  const parsed = new URL(serverUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("ARCADE_MULTIPLAYER_SERVER debe ser una URL HTTP o HTTPS.");
  }
}

fs.mkdirSync(output, { recursive: true });
const gamesOutput = path.join(output, "GAMES");
fs.mkdirSync(gamesOutput, { recursive: true });
for (const file of ["index.html"]) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
for (const file of ["bubbletrouble.swf", "zombie-trailer-park.swf"]) {
  fs.copyFileSync(path.join(root, "GAMES", file), path.join(gamesOutput, file));
}
for (const file of ["bubbletrouble.swf", "zombie-trailer-park.swf"]) {
  fs.rmSync(path.join(output, file), { force: true });
}

const catalogPath = path.join(root, "catalogo.json");
if (fs.existsSync(catalogPath)) {
  fs.copyFileSync(catalogPath, path.join(output, "catalogo.json"));
} else {
  fs.writeFileSync(path.join(output, "catalogo.json"), "[]\n");
}

fs.writeFileSync(
  path.join(output, "config.js"),
  `window.ARCADE_MULTIPLAYER_SERVER = ${JSON.stringify(serverUrl)};\n`
);
