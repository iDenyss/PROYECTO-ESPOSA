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
if (!fs.existsSync(path.join(output, "index.html"))) {
  throw new Error("Vite no generó dist/index.html.");
}
const gamesOutput = path.join(output, "GAMES");
fs.mkdirSync(gamesOutput, { recursive: true });
const gameFiles = [
  "age_of_war.swf",
  "Bad_Ice_Cream.swf",
  "bloons-tower-defence-4.swf",
  "bubbletrouble.swf",
  "the-world's-hardest-game.swf",
  "zombie-trailer-park.swf"
];
for (const file of gameFiles) {
  const source = path.join(root, "GAMES", file);
  if (!fs.existsSync(source)) throw new Error(`No se encontró el juego ${source}.`);
  fs.copyFileSync(source, path.join(gamesOutput, file));
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
