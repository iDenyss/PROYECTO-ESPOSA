const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { WebSocket, WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const ROOM_TTL = 30 * 60 * 1000;
const rooms = new Map();
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const allowedKeys = {
  bubble: {
    1: new Set([32, 37, 39]),
    2: new Set([67, 87, 88])
  },
  icecream: {
    1: new Set([32, 37, 38, 39, 40]),
    2: new Set([65, 68, 70, 83, 87])
  }
};
const gameIds = new Set(["bubble-trouble", "bad-ice-cream-1", "bad-ice-cream-2", "bad-ice-cream-3"]);
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/config.js", ["config.js", "text/javascript; charset=utf-8"]],
  ["/GAMES/Bad_Ice_Cream.swf", ["GAMES/Bad_Ice_Cream.swf", "application/x-shockwave-flash"]],
  ["/GAMES/Bad_Ice_Cream_2.swf", ["GAMES/Bad_Ice_Cream_2.swf", "application/x-shockwave-flash"]],
  ["/GAMES/Bad_Ice_Cream_3.swf", ["GAMES/Bad_Ice_Cream_3.swf", "application/x-shockwave-flash"]],
  ["/GAMES/bubbletrouble.swf", ["GAMES/bubbletrouble.swf", "application/x-shockwave-flash"]],
  ["/GAMES/zombie-trailer-park.swf", ["GAMES/zombie-trailer-park.swf", "application/x-shockwave-flash"]]
]);

function reply(req, res, status, value) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  if (req.headers.origin && allowedOrigins.has(req.headers.origin)) {
    headers["Access-Control-Allow-Origin"] = req.headers.origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers.Vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2048) {
        reject(new Error("El cuerpo de la solicitud es demasiado grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error("JSON inválido.")); }
    });
    req.on("error", reject);
  });
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function newRoomCode() {
  let code;
  do { code = crypto.randomBytes(4).toString("hex").toUpperCase(); }
  while (rooms.has(code));
  return code;
}

function send(socket, value) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function broadcastStatus(room) {
  const connectedPlayers = [1, 2].filter((seat) => room.players[seat]?.socket?.readyState === WebSocket.OPEN).length;
  for (const seat of [1, 2]) send(room.players[seat]?.socket, { type: "status", connectedPlayers });
}

function validSignal(seat, signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal)) return false;
  if (signal.type === "offer" || signal.type === "answer") {
    return (signal.type === "offer" ? seat === 1 : seat === 2)
      && typeof signal.sdp === "string"
      && signal.sdp.length > 0
      && signal.sdp.length <= 60_000;
  }
  if (signal.type !== "candidate") return false;
  if (signal.candidate === null) return true;
  const candidate = signal.candidate;
  return candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && typeof candidate.candidate === "string"
    && candidate.candidate.length <= 4096
    && (candidate.sdpMid === null || typeof candidate.sdpMid === "string" && candidate.sdpMid.length <= 256)
    && (candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex) && candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 255);
}

function handleHttp(req, res) {
  const url = new URL(req.url, "http://localhost");
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return reply(req, res, 403, { error: "Este origen no está autorizado." });
  }
  if (req.method === "OPTIONS") {
    if (!origin) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    });
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/health") {
    return reply(req, res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    if (rooms.size >= 1000) return reply(req, res, 503, { error: "El servidor está lleno. Intenta más tarde." });
    return readJson(req).then(({ gameId = "bubble-trouble" }) => {
      if (!gameIds.has(gameId)) return reply(req, res, 400, { error: "El juego seleccionado no está disponible para multijugador." });
      const code = newRoomCode();
      const token = newToken();
      rooms.set(code, {
        code, gameId, createdAt: Date.now(), lastActive: Date.now(), started: false,
        players: { 1: { token, socket: null }, 2: null }
      });
      reply(req, res, 201, { code, token, seat: 1, gameId });
    }).catch((error) => reply(req, res, 400, { error: error.message }));
  }
  if (req.method === "POST" && url.pathname === "/api/rooms/join") {
    return readJson(req).then(({ code }) => {
      const normalized = typeof code === "string" ? code.toUpperCase() : "";
      const room = rooms.get(normalized);
      if (!/^[0-9A-F]{8}$/.test(normalized) || !room) return reply(req, res, 404, { error: "No se encontró esa sala." });
      if (room.players[2]) return reply(req, res, 409, { error: "La sala ya tiene dos jugadores." });
      const token = newToken();
      room.players[2] = { token, socket: null };
      room.lastActive = Date.now();
      reply(req, res, 200, { code: normalized, token, seat: 2, gameId: room.gameId });
    }).catch((error) => reply(req, res, 400, { error: error.message }));
  }

  if (req.method !== "GET") return reply(req, res, 404, { error: "No encontrado." });
  if (url.pathname === "/catalogo.json") {
    const catalogPath = path.join(__dirname, "catalogo.json");
    return fs.readFile(catalogPath, "utf8", (error, contents) => {
      if (error?.code === "ENOENT") return reply(req, res, 200, []);
      if (error) return reply(req, res, 500, { error: "No se pudo leer el catálogo." });
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      });
      res.end(contents);
    });
  }
  const file = staticFiles.get(url.pathname);
  if (!file) return reply(req, res, 404, { error: "No encontrado." });
  const filePath = path.join(__dirname, file[0]);
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return reply(req, res, 404, { error: "No se encontró el archivo." });
    res.writeHead(200, {
      "Content-Type": file[1],
      "Content-Length": stats.size,
      "Cache-Control": file[0] === "index.html" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  handleHttp(req, res);
});
const webSockets = new WebSocketServer({ noServer: true, maxPayload: 65_536, perMessageDeflate: false });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const room = rooms.get(url.searchParams.get("room") || "");
  const token = url.searchParams.get("token");
  const seat = room && [1, 2].find((number) => room.players[number]?.token === token);
  if (url.pathname !== "/ws" || !seat) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  webSockets.handleUpgrade(req, socket, head, (client) => {
    webSockets.emit("connection", client, room, seat);
  });
});

webSockets.on("connection", (client, room, seat) => {
  const player = room.players[seat];
  if (player.socket && player.socket !== client) player.socket.close(4001, "Reconnected");
  player.socket = client;
  room.lastActive = Date.now();
  broadcastStatus(room);

  let intervalStart = Date.now();
  let messageCount = 0;
  client.on("message", (data) => {
    const now = Date.now();
    if (now - intervalStart >= 1000) { intervalStart = now; messageCount = 0; }
    if (++messageCount > 120) { client.close(1008, "Rate limit"); return; }
    let message;
    try { message = JSON.parse(data.toString()); }
    catch { client.close(1008, "Invalid message"); return; }
    if (message.type === "input") {
      const game = room.gameId === "bubble-trouble" ? allowedKeys.bubble : allowedKeys.icecream;
      if (!room.started || !game[seat].has(message.keyCode) || typeof message.down !== "boolean") {
        client.close(1008, "Invalid input");
        return;
      }
      room.lastActive = now;
      send(room.players[seat === 1 ? 2 : 1]?.socket, {
        type: "input", keyCode: message.keyCode, down: message.down
      });
      return;
    }
    if (message.type === "signal") {
      if (!room.started || !validSignal(seat, message.signal)) {
        client.close(1008, "Invalid signal");
        return;
      }
      room.lastActive = now;
      send(room.players[seat === 1 ? 2 : 1]?.socket, {
        type: "signal", signal: message.signal
      });
      return;
    }
    if (message.type === "media-error" && seat === 1 && room.started) {
      send(room.players[2]?.socket, { type: "media-error" });
      return;
    }
    if (message.type === "start" && seat === 1 && !room.started) {
      const ready = [1, 2].every((number) => room.players[number]?.socket?.readyState === WebSocket.OPEN);
      if (ready) {
        room.started = true;
        room.lastActive = now;
        for (const number of [1, 2]) send(room.players[number].socket, { type: "start", gameId: room.gameId });
      }
      return;
    }
    client.close(1008, "Unsupported message");
  });

  client.on("close", () => {
    if (player.socket === client) player.socket = null;
    room.lastActive = Date.now();
    broadcastStatus(room);
  });
});

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL;
  for (const [code, room] of rooms) {
    if (room.lastActive < cutoff) {
      for (const seat of [1, 2]) room.players[seat]?.socket?.close(4000, "Room expired");
      rooms.delete(code);
    }
  }
}, 60_000).unref();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Arcade SWF disponible en el puerto ${PORT}`);
});
