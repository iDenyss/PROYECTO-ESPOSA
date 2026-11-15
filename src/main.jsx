import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const INITIAL_CATALOGS = [
  { id: "accion", name: "Acción", games: [
    { id: "bubble-trouble", title: "Bubble Trouble", swf: "GAMES/bubbletrouble.swf", icon: "🫧", orientation: "portrait" },
    { id: "bad-ice-cream-1", title: "Bad Ice Cream", swf: "GAMES/Bad_Ice_Cream.swf", icon: "🍦", orientation: "landscape", controls: "icecream" }
  ]},
  { id: "estrategia", name: "Estrategia", games: [
    { id: "zombie-trailer-park", title: "Zombie Trailer Park", swf: "GAMES/zombie-trailer-park.swf", icon: "🧟", orientation: "landscape" }
  ]}
];

const KEY_INFO = {
  32: [" ", "Space"],
  65: ["a", "KeyA"],
  68: ["d", "KeyD"],
  70: ["f", "KeyF"],
  37: ["ArrowLeft", "ArrowLeft"],
  38: ["ArrowUp", "ArrowUp"],
  39: ["ArrowRight", "ArrowRight"],
  40: ["ArrowDown", "ArrowDown"],
  67: ["c", "KeyC"],
  83: ["s", "KeyS"],
  87: ["w", "KeyW"],
  88: ["x", "KeyX"]
};
const DB_NAME = "arcade-swf";
const STORE = "files";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function libraryAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function libraryAdd(name, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).add({ name, blob, added: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function libraryDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function hue(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) % 360;
  return value;
}

function gradient(title) {
  const color = hue(title);
  return `linear-gradient(135deg, hsl(${color} 70% 62%), hsl(${(color + 55) % 360} 72% 48%))`;
}

function App() {
  const [catalogs, setCatalogs] = useState(INITIAL_CATALOGS);
  const [category, setCategory] = useState("todos");
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState([]);
  const [activeGame, setActiveGame] = useState(null);
  const [reloadId, setReloadId] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [lobbyGame, setLobbyGame] = useState(INITIAL_CATALOGS[0].games[0]);
  const [lobbyStatus, setLobbyStatus] = useState("Conectando al servidor...");
  const [roomCode, setRoomCode] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [roomReady, setRoomReady] = useState(false);
  const [playerSeat, setPlayerSeat] = useState(null);
  const [onlineStarted, setOnlineStarted] = useState(false);
  const [remoteView, setRemoteView] = useState(false);
  const [hideBar, setHideBar] = useState(false);
  const stageRef = useRef(null);
  const ruffleRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const localKeysRef = useRef(new Set());
  const remoteKeysRef = useRef(new Set());
  const activeGameRef = useRef(null);
  const stateRef = useRef({});
  const toastTimerRef = useRef(null);
  const joystickCodesRef = useRef(new Set());
  const joystickRef = useRef(null);
  const [joystickPosition, setJoystickPosition] = useState({ x: 0, y: 0 });
  const [actionPressed, setActionPressed] = useState(false);

  activeGameRef.current = activeGame;
  stateRef.current = {
    activeGame, onlineStarted, remoteView, playerSeat, roomCode,
    setLobbyStatus, setLobbyOpen
  };

  const showToast = useCallback((message) => {
    setToastMessage(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 3200);
  }, []);

  const dispatchKey = useCallback((keyCode, down, heldKeys) => {
    if (down === heldKeys.has(keyCode)) return;
    if (down) heldKeys.add(keyCode);
    else heldKeys.delete(keyCode);
    const [key, code] = KEY_INFO[keyCode] || ["", ""];
    const event = new KeyboardEvent(down ? "keydown" : "keyup", {
      key, code, bubbles: true, cancelable: true, repeat: false, keyCode, which: keyCode
    });
    try { Object.defineProperty(event, "keyCode", { get: () => keyCode }); } catch {}
    try { Object.defineProperty(event, "which", { get: () => keyCode }); } catch {}
    const player = ruffleRef.current;
    if (player) {
      player.focus();
      player.dispatchEvent(event);
    } else {
      document.dispatchEvent(event);
    }
  }, []);

  const sendPlayerKey = useCallback((keyCode, down) => {
    const { onlineStarted: online, playerSeat: seat } = stateRef.current;
    const socket = socketRef.current;
    if (online && seat === 2) {
      const held = localKeysRef.current;
      if (down === held.has(keyCode)) return;
      if (down) held.add(keyCode);
      else held.delete(keyCode);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", keyCode, down }));
      return;
    }
    dispatchKey(keyCode, down, localKeysRef.current);
  }, [dispatchKey]);

  const setKeyCodes = useCallback((nextCodes) => {
    for (const code of joystickCodesRef.current) {
      if (!nextCodes.has(code)) sendPlayerKey(code, false);
    }
    for (const code of nextCodes) {
      if (!joystickCodesRef.current.has(code)) sendPlayerKey(code, true);
    }
    joystickCodesRef.current = new Set(nextCodes);
  }, [sendPlayerKey]);

  const showPeerError = useCallback((message) => {
    showToast(message);
    if (stateRef.current.playerSeat === 2 && stateRef.current.remoteView) setLobbyStatus(message);
  }, [showToast]);

  const sendSignal = useCallback((signal) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) throw new Error("Se perdió la conexión con la sala.");
    socket.send(JSON.stringify({ type: "signal", signal }));
  }, []);

  const handlePeerSignal = useCallback(async (signal) => {
    if (!signal || !stateRef.current.onlineStarted) return;
    const peer = peerRef.current;
    if (!peer) return;
    if (signal.type === "offer" && stateRef.current.playerSeat === 2) {
      await peer.setRemoteDescription(signal);
      for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
      await peer.setLocalDescription(await peer.createAnswer());
      sendSignal({ type: peer.localDescription.type, sdp: peer.localDescription.sdp });
      return;
    }
    if (signal.type === "answer" && stateRef.current.playerSeat === 1) {
      await peer.setRemoteDescription(signal);
      for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
      return;
    }
    if (signal.type === "candidate") {
      if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
      else pendingCandidatesRef.current.push(signal.candidate);
    }
  }, [sendSignal]);

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) return peerRef.current;
    if (!window.RTCPeerConnection) throw new Error("Este navegador no admite transmisión WebRTC.");
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerRef.current = peer;
    peer.addEventListener("icecandidate", (event) => {
      if (!event.candidate || peerRef.current !== peer) return;
      try { sendSignal({ type: "candidate", candidate: event.candidate.toJSON() }); }
      catch { showPeerError("No se pudo enviar la señal de conexión."); }
    });
    peer.addEventListener("connectionstatechange", () => {
      if (peerRef.current === peer && peer.connectionState === "failed") {
        showPeerError("No se pudo establecer el video entre los teléfonos. Intenta de nuevo.");
      }
    });
    peer.addEventListener("track", (event) => {
      if (stateRef.current.playerSeat !== 2 || !remoteVideoRef.current) return;
      remoteVideoRef.current.srcObject = event.streams[0] || new MediaStream([event.track]);
      remoteVideoRef.current.play().catch(() => setLobbyStatus("Toca la pantalla para iniciar el video."));
    });
    return peer;
  }, [sendSignal, showPeerError]);

  const connectRoom = useCallback(({ code, token, seat }) => {
    socketRef.current?.close();
    setRoomCode(code);
    setPlayerSeat(seat);
    setRoomReady(false);
    setLobbyStatus("Conectando a la sala...");
    const configuredServer = (window.ARCADE_MULTIPLAYER_SERVER || "").trim().replace(/\/+$/, "");
    const serverUrl = new URL(configuredServer || location.origin);
    const protocol = serverUrl.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${serverUrl.host}/ws?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
    socketRef.current = socket;
    socket.addEventListener("open", () => setLobbyStatus("Conectado. Esperando al otro jugador..."));
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === "status") {
        setRoomReady(message.connectedPlayers === 2);
        setLobbyStatus(message.connectedPlayers === 2 ? "Los dos jugadores están conectados." : "Sala creada. Esperando al segundo jugador...");
        if (stateRef.current.onlineStarted && message.connectedPlayers < 2) {
          for (const code of [...remoteKeysRef.current]) dispatchKey(code, false, remoteKeysRef.current);
          showToast("El otro jugador se desconectó.");
        }
      }
      if (message.type === "input" && seat === 1) dispatchKey(message.keyCode, message.down, remoteKeysRef.current);
      if (message.type === "signal") handlePeerSignal(message.signal).catch(() => showPeerError("No se pudo conectar la transmisión entre los teléfonos."));
      if (message.type === "media-error" && seat === 2) showPeerError("El anfitrión no pudo compartir la pantalla en este dispositivo.");
      if (message.type === "start") {
        const gameId = message.gameId || "bubble-trouble";
        const game = INITIAL_CATALOGS.flatMap((catalog) => catalog.games).find((item) => item.id === gameId);
        if (!game) { setLobbyStatus("El servidor indicó un juego no disponible."); return; }
        setOnlineStarted(true);
        setRemoteView(seat === 2);
        setLobbyOpen(false);
        setHideBar(false);
        setActiveGame(game);
        setLobbyGame(game);
        if (seat === 2) {
          try { createPeerConnection(); }
          catch (error) { showPeerError(error.message); }
        }
      }
    });
    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      for (const code of [...localKeysRef.current]) dispatchKey(code, false, localKeysRef.current);
      for (const code of [...remoteKeysRef.current]) dispatchKey(code, false, remoteKeysRef.current);
      if (stateRef.current.roomCode) setLobbyStatus("Se perdió la conexión con la sala.");
    });
    socket.addEventListener("error", () => setLobbyStatus("No se pudo conectar. Verifica que el servidor esté publicado con HTTPS."));
  }, [createPeerConnection, dispatchKey, handlePeerSignal, showPeerError, showToast]);

  const leaveMultiplayer = useCallback(() => {
    const socket = socketRef.current;
    if (stateRef.current.onlineStarted && stateRef.current.playerSeat === 2 && socket?.readyState === WebSocket.OPEN) {
      for (const keyCode of [...localKeysRef.current]) socket.send(JSON.stringify({ type: "input", keyCode, down: false }));
    }
    for (const code of [...localKeysRef.current]) dispatchKey(code, false, localKeysRef.current);
    for (const code of [...remoteKeysRef.current]) dispatchKey(code, false, remoteKeysRef.current);
    peerRef.current?.close();
    peerRef.current = null;
    for (const track of streamRef.current?.getTracks() || []) track.stop();
    streamRef.current = null;
    pendingCandidatesRef.current = [];
    socketRef.current = null;
    socket?.close();
    setRoomCode("");
    setPlayerSeat(null);
    setRoomReady(false);
    setOnlineStarted(false);
    setRemoteView(false);
  }, [dispatchKey]);

  const closeGame = useCallback(() => {
    setActiveGame(null);
    setHideBar(false);
    leaveMultiplayer();
    document.body.classList.remove("locked");
    remoteVideoRef.current?.pause();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [leaveMultiplayer]);

  const openGame = useCallback((game) => {
    leaveMultiplayer();
    setRemoteView(false);
    setActiveGame(game);
    setHideBar(false);
    document.body.classList.add("locked");
  }, [leaveMultiplayer]);

  const openLobby = (game = INITIAL_CATALOGS[0].games[0]) => {
    setLobbyGame(game);
    setLobbyStatus("Crea una sala o ingresa el código de tu amigo.");
    setLobbyOpen(true);
  };

  useEffect(() => {
    let active = true;
    let player;
    if (!activeGame || remoteView) return undefined;
    const mount = async () => {
      if (!window.RufflePlayer || !stageRef.current) {
        showToast("Ruffle no se pudo cargar. Revisa tu conexión.");
        return;
      }
      const ruffle = window.RufflePlayer.newest();
      player = ruffle.createPlayer();
      ruffleRef.current = player;
      stageRef.current.prepend(player);
      const options = {
        autoplay: "on",
        unmuteOverlay: "hidden",
        backgroundColor: "#000000",
        letterbox: "on",
        scale: "showAll",
        forceScale: true,
        forceAlign: true,
        salign: "C",
        quality: activeGame.title === "Zombie Trailer Park" ? "medium" : "high",
        splashScreen: false,
        contextMenu: "off",
        warnOnUnsupportedContent: false
      };
      try {
        if (activeGame.blob) {
          const data = new Uint8Array(await activeGame.blob.arrayBuffer());
          await player.load({ data, ...options });
        } else {
          await player.load({ url: activeGame.swf, ...options });
        }
      } catch {
        showToast("No se pudo abrir este juego.");
        return;
      }
      if (active && onlineStarted && playerSeat === 1) {
        try {
          await startHostStream();
        } catch (error) {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "media-error" }));
          }
          showPeerError(error.message || "No se pudo transmitir el juego.");
        }
      }
    };
    const startHostStream = async () => {
      const deadline = Date.now() + 15000;
      let canvas;
      while (Date.now() < deadline) {
        canvas = player?.shadowRoot?.querySelector("canvas");
        if (canvas?.width && canvas?.height) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!canvas || typeof canvas.captureStream !== "function") {
        throw new Error("No se pudo capturar la pantalla del juego.");
      }
      const stream = canvas.captureStream(30);
      if (!stream.getVideoTracks().length) throw new Error("No se pudo capturar el video del juego.");
      streamRef.current = stream;
      const peer = createPeerConnection();
      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      await peer.setLocalDescription(await peer.createOffer());
      sendSignal({ type: peer.localDescription.type, sdp: peer.localDescription.sdp });
    };
    mount();
    return () => {
      active = false;
      if (ruffleRef.current === player) ruffleRef.current = null;
      player?.remove();
    };
  }, [activeGame, onlineStarted, playerSeat, reloadId, remoteView, createPeerConnection, sendSignal, showToast]);

  useEffect(() => {
    if (activeGame) {
      document.body.classList.add("locked");
      return () => document.body.classList.remove("locked");
    }
    document.body.classList.remove("locked");
    return undefined;
  }, [activeGame]);

  useEffect(() => {
    libraryAll().then(setLibrary).catch(() => showToast("No se pudo leer Mi biblioteca en este navegador."));
    fetch("catalogo.json", { cache: "no-cache" })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => { if (Array.isArray(data) && data.length) setCatalogs(data); })
      .catch(() => {});
    const inviteCode = new URLSearchParams(location.search).get("room");
    if (inviteCode) {
      setRoomInput(inviteCode.replace(/[^a-z0-9]/gi, "").toUpperCase());
      setLobbyOpen(true);
    }
  }, [showToast]);

  useEffect(() => {
    if (!activeGame) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeGame();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeGame, closeGame]);

  useEffect(() => {
    const onBlur = () => {
      stopJoystick();
      for (const code of [...localKeysRef.current]) sendPlayerKey(code, false);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [sendPlayerKey]);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const requestRoom = async (path, body = {}) => {
    const serverUrl = (window.ARCADE_MULTIPLAYER_SERVER || "").trim().replace(/\/+$/, "");
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    if (!serverUrl && !isLocal) throw new Error("Falta configurar ARCADE_MULTIPLAYER_SERVER en Netlify.");
    const response = await fetch(`${serverUrl || location.origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; }
    catch {
      if (response.status === 404) throw new Error(`El servidor ${serverUrl} respondió 404. Comprueba que Render haya desplegado server.js.`);
      throw new Error(`El servidor online respondió con datos inválidos (HTTP ${response.status}).`);
    }
    if (response.status === 403) {
      throw new Error(`Render rechazó el origen ${location.origin}. Configura ALLOWED_ORIGINS en Render con esa URL exacta (sin ruta ni barra final).`);
    }
    if (!response.ok) throw new Error(result?.error || `No se pudo crear o abrir la sala (HTTP ${response.status}).`);
    return result;
  };

  const createRoom = async () => {
    try { connectRoom(await requestRoom("/api/rooms", { gameId: lobbyGame.id })); }
    catch (error) { setLobbyStatus(error instanceof TypeError ? `No se pudo conectar con Render desde ${location.origin}. Comprueba que ALLOWED_ORIGINS en Render incluya esa URL exacta.` : error.message); }
  };

  const joinRoom = async () => {
    const code = roomInput.trim().toUpperCase();
    if (!code) { setLobbyStatus("Escribe el código de sala."); return; }
    try {
      const room = await requestRoom("/api/rooms/join", { code });
      const game = INITIAL_CATALOGS.flatMap((catalog) => catalog.games).find((item) => item.id === room.gameId);
      if (game) setLobbyGame(game);
      connectRoom(room);
    }
    catch (error) { setLobbyStatus(error instanceof TypeError ? `No se pudo conectar con Render desde ${location.origin}. Comprueba que ALLOWED_ORIGINS en Render incluya esa URL exacta.` : error.message); }
  };

  const startMatch = () => {
    if (roomReady && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "start" }));
    }
  };

  const copyRoom = async () => {
    const invite = new URL(location.href);
    invite.searchParams.set("room", roomCode);
    try {
      await navigator.clipboard.writeText(invite.href);
      setLobbyStatus("Invitación copiada. Envíala al otro jugador.");
    } catch {
      setLobbyStatus(`Código de sala: ${roomCode}`);
    }
  };

  const reloadGame = () => setReloadId((value) => value + 1);

  const handleFiles = async (event) => {
    const files = [...event.target.files];
    const valid = files.filter((file) => /\.swf$/i.test(file.name));
    try {
      for (const file of valid) await libraryAdd(file.name, file);
      setLibrary(await libraryAll());
      setCategory("mi");
      if (valid.length) showToast(valid.length === 1 ? "Juego agregado a Mi biblioteca" : `${valid.length} juegos agregados a Mi biblioteca`);
      else if (files.length) showToast("Solo se pueden agregar archivos .swf");
    } catch {
      showToast("No se pudieron guardar los juegos en este navegador.");
    }
    event.target.value = "";
  };

  const deleteLibraryGame = async (id) => {
    try { await libraryDelete(id); setLibrary(await libraryAll()); }
    catch { showToast("No se pudo quitar el juego de Mi biblioteca."); }
  };

  const allGames = useMemo(() => catalogs.flatMap((catalog) => catalog.games), [catalogs]);
  const normalizedSearch = search.trim().toLowerCase();
  const matches = (game) => !normalizedSearch || game.title.toLowerCase().includes(normalizedSearch);
  const visibleCatalogs = category === "mi" ? [] : catalogs
    .filter((catalog) => category === "todos" || category === catalog.id)
    .map((catalog) => ({ ...catalog, games: catalog.games.filter(matches) }))
    .filter((catalog) => catalog.games.length);
  const libraryGames = library.filter((file) => matches({ title: file.name.replace(/\.swf$/i, "") }));
  const visibleCount = visibleCatalogs.reduce((count, catalog) => count + catalog.games.length, 0) + (category === "todos" || category === "mi" ? libraryGames.length : 0);
  const portraitGame = activeGame?.orientation === "portrait" || activeGame?.title === "Bubble Trouble";
  const landscapeGame = activeGame?.orientation === "landscape" && activeGame?.controls === "icecream";

  const releaseButton = (event) => {
    const pointerKeys = event.currentTarget.__pointerKeys;
    const code = pointerKeys?.get(event.pointerId);
    if (code === undefined) return;
    pointerKeys.delete(event.pointerId);
    sendPlayerKey(code, false);
    event.currentTarget.classList.remove("pressed");
  };

  const startButton = (event, code) => {
    event.preventDefault();
    event.currentTarget.__pointerKeys ||= new Map();
    const pointerKeys = event.currentTarget.__pointerKeys;
    if (pointerKeys.has(event.pointerId)) return;
    pointerKeys.set(event.pointerId, code);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add("pressed");
    sendPlayerKey(code, true);
  };

  const stopJoystick = () => {
    setKeyCodes(new Set());
    setJoystickPosition({ x: 0, y: 0 });
  };

  const moveJoystick = (event) => {
    const pad = joystickRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - (rect.left + radius);
    const dy = event.clientY - (rect.top + radius);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius * .62 ? radius * .62 / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setJoystickPosition({ x, y });
    const threshold = radius * .28;
    const playerTwo = onlineStarted && playerSeat === 2;
    const nextCodes = new Set();
    if (Math.abs(dx) > threshold) nextCodes.add(dx < 0 ? (playerTwo ? 65 : 37) : (playerTwo ? 68 : 39));
    if (Math.abs(dy) > threshold) nextCodes.add(dy < 0 ? (playerTwo ? 87 : 38) : (playerTwo ? 83 : 40));
    setKeyCodes(nextCodes);
  };

  const beginJoystick = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveJoystick(event);
  };

  const categories = [{ id: "todos", name: "Todos" }, ...catalogs, { id: "mi", name: "Mi biblioteca" }];

  return (
    <>
      <header>
        <div className="brand">
          <div className="logo" aria-hidden="true">🕹️</div>
          <h1>Arcade SWF</h1>
          <button className="add-btn" type="button" onClick={() => document.getElementById("fileInput").click()}>Agregar SWF</button>
        </div>
        <input className="search" type="search" placeholder="Buscar juego" aria-label="Buscar juego" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} />
        <nav className="chips" aria-label="Catálogos">
          {categories.map((item) => (
            <button key={item.id} className="chip" type="button" aria-pressed={category === item.id} onClick={() => { setCategory(item.id); window.scrollTo({ top: 0 }); }}>{item.name}</button>
          ))}
        </nav>
      </header>

      <main>
        {visibleCatalogs.map((catalog) => (
          <section key={catalog.id}>
            <div className="sec-head"><h2>{catalog.name}</h2><span>{catalog.games.length} {catalog.games.length === 1 ? "juego" : "juegos"}</span></div>
            <div className="grid">
              {catalog.games.map((game) => <GameTile key={game.swf} game={game} subtitle={catalog.name} onPlay={openGame} onMultiplayer={game.controls === "icecream" || game.id === "bubble-trouble" || game.title === "Bubble Trouble" ? openLobby : undefined} />)}
            </div>
          </section>
        ))}
        {(category === "todos" || category === "mi") && (
          <section>
            <div className="sec-head"><h2>Mi biblioteca</h2><span>{libraryGames.length} {libraryGames.length === 1 ? "juego" : "juegos"}</span></div>
            {libraryGames.length ? (
              <div className="grid">
                {libraryGames.map((file) => {
                  const game = { title: file.name.replace(/\.swf$/i, ""), icon: "📁", blob: file.blob };
                  return <GameTile key={file.id} game={game} subtitle="En este dispositivo" onPlay={openGame} onDelete={() => deleteLibraryGame(file.id)} />;
                })}
              </div>
            ) : (
              <div className="empty">
                Aquí van los archivos .swf que agregues desde tu iPhone. Se guardan solo en este dispositivo.
                <br /><button type="button" onClick={() => document.getElementById("fileInput").click()}>Agregar SWF</button>
              </div>
            )}
          </section>
        )}
        {visibleCount === 0 && category !== "mi" && <div className="empty">{normalizedSearch ? `No hay juegos que coincidan con “${search}”.` : "Este catálogo todavía no tiene juegos."}</div>}
      </main>

      <input id="fileInput" type="file" accept=".swf,application/x-shockwave-flash,application/octet-stream" multiple hidden onChange={handleFiles} />

      {lobbyOpen && (
        <div className="lobby" role="dialog" aria-modal="true" aria-labelledby="lobbyTitle">
          <div className="lobby-card">
            <h2 id="lobbyTitle">{lobbyGame.title} online</h2>
            <p>El anfitrión ejecuta el juego y comparte la pantalla; el segundo jugador la ve y envía sus controles.</p>
            <p className="lobby-status" role="status">{lobbyStatus}</p>
            {roomCode ? <div className="room-code">{roomCode}</div> : (
              <input className="room-input" type="text" inputMode="text" maxLength={8} placeholder="Código de sala" aria-label="Código de sala" autoComplete="off" value={roomInput} onChange={(event) => setRoomInput(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} />
            )}
            <div className="lobby-actions">
              {!roomCode && <>
                <button type="button" onClick={createRoom}>Crear sala</button>
                <button type="button" onClick={joinRoom}>Unirse a una sala</button>
              </>}
              {roomCode && <button className="secondary" type="button" onClick={copyRoom}>Copiar invitación</button>}
              {roomCode && playerSeat === 1 && <button type="button" disabled={!roomReady} onClick={startMatch}>{roomReady ? "Comenzar partida" : "Esperando al otro jugador"}</button>}
              <button className="secondary" type="button" onClick={() => { setLobbyOpen(false); leaveMultiplayer(); }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {activeGame && (
        <div id="player" className={[
          activeGame ? "open" : "",
          onlineStarted ? "online-game" : "",
          remoteView ? "remote-view" : "",
          portraitGame ? "portrait-game" : "",
          landscapeGame ? "landscape-game" : "",
          hideBar ? "hide-bar" : ""
        ].filter(Boolean).join(" ")} role="dialog" aria-modal="true" aria-label="Reproductor">
          <div className="bar">
            <button className="close" type="button" onClick={closeGame}>Cerrar</button>
            <div className="title">{remoteView ? `${activeGame.title} — pantalla compartida` : activeGame.title}</div>
            {!onlineStarted && <button type="button" onClick={reloadGame}>Reiniciar</button>}
            <button type="button" onClick={() => {
              const player = document.getElementById("player");
              if (player.requestFullscreen && !document.fullscreenElement) player.requestFullscreen().then(() => setHideBar(true)).catch(() => setHideBar(true));
              else { setHideBar(true); showToast("Para pantalla completa real en iPhone: Compartir → Agregar a pantalla de inicio."); }
            }}>Pantalla completa</button>
          </div>
          <div id="stage" ref={stageRef} key={reloadId}>
            {remoteView && <video id="remoteScreen" ref={remoteVideoRef} autoPlay playsInline muted onPlaying={() => setLobbyStatus("")} onClick={(event) => event.currentTarget.play().catch(() => setLobbyStatus("Toca la pantalla para iniciar el video."))} />}
            {remoteView && lobbyStatus && <div className="stream-status" role="status">{lobbyStatus}</div>}
            {hideBar && <button id="reveal" type="button" aria-label="Mostrar barra" onClick={() => setHideBar(false)}>☰</button>}
          </div>
          {activeGame.controls === "icecream" && (
            <div className="landscape-controls" aria-label="Controles táctiles de Bad Ice Cream">
              <div
                ref={joystickRef}
                className="joystick"
                role="application"
                aria-label="Joystick de movimiento"
                onPointerDown={beginJoystick}
                onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveJoystick(event); }}
                onPointerUp={stopJoystick}
                onPointerCancel={stopJoystick}
              >
                <div className="joystick-knob" style={{ left: `calc(50% + ${joystickPosition.x}px)`, top: `calc(50% + ${joystickPosition.y}px)` }} />
              </div>
              <button
                className={`action-button${actionPressed ? " pressed" : ""}`}
                type="button"
                aria-label="Acción"
                onPointerDown={(event) => { setActionPressed(true); startButton(event, onlineStarted && playerSeat === 2 ? 70 : 32); }}
                onPointerUp={(event) => { setActionPressed(false); releaseButton(event, sendPlayerKey); }}
                onPointerCancel={(event) => { setActionPressed(false); releaseButton(event, sendPlayerKey); }}
              >ACCIÓN</button>
            </div>
          )}
          {activeGame.title === "Bubble Trouble" && (
            <div className="touch-controls" aria-label="Controles táctiles">
              <div className="touch-group">
                <TouchKey label="Mover a la izquierda" text="◀" code={onlineStarted && playerSeat === 2 ? 88 : 37} onDown={startButton} onUp={(event) => releaseButton(event, sendPlayerKey)} />
                <TouchKey label="Disparar" fire code={onlineStarted && playerSeat === 2 ? 87 : 32} onDown={startButton} onUp={(event) => releaseButton(event, sendPlayerKey)} />
                <TouchKey label="Mover a la derecha" text="▶" code={onlineStarted && playerSeat === 2 ? 67 : 39} onDown={startButton} onUp={(event) => releaseButton(event, sendPlayerKey)} />
              </div>
            </div>
          )}
          <div id="orientationNotice" role="status">
            <span>{portraitGame ? "Gira el teléfono en vertical para jugar." : "Gira el teléfono en horizontal para jugar."}</span>
          </div>
        </div>
      )}

      {toastMessage && <div id="toast" role="status">{toastMessage}</div>}
    </>
  );
}

function TouchKey({ label, text = "", fire = false, code, onDown, onUp }) {
  return (
    <button
      className={`touch-key${fire ? " fire" : ""}`}
      type="button"
      aria-label={label}
      onPointerDown={(event) => onDown(event, code)}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >{text}</button>
  );
}

function GameTile({ game, subtitle, onPlay, onDelete, onMultiplayer }) {
  return (
    <div className="tile">
      <button className="play" type="button" aria-label={`Jugar ${game.title}`} onClick={() => onPlay(game)}>
        <div className="art" style={{ backgroundImage: `${game.thumb ? `url('${game.thumb.replace(/'/g, "%27")}'),` : ""}${gradient(game.title)}` }}>
          {game.thumb ? "" : (game.icon || "🎮")}
        </div>
        <div className="meta"><b>{game.title}</b><small>{subtitle}</small></div>
      </button>
      {onMultiplayer && <button className="multiplayer-cta" type="button" onClick={() => onMultiplayer(game)}>Jugar online</button>}
      {onDelete && <button className="del" type="button" aria-label={`Quitar ${game.title}`} onClick={onDelete}>×</button>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
