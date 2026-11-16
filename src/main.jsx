import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import PacmanGame from "./PacmanGame";
import "./styles.css";

const INITIAL_CATALOGS = [
  { id: "accion", name: "Acción", games: [
    { id: "bubble-trouble", title: "Bubble Trouble", swf: "GAMES/bubbletrouble.swf", icon: "🫧", thumb: "/images/bubble-trouble.jpg", orientation: "portrait" },
    { id: "bad-ice-cream-1", title: "Bad Ice Cream", swf: "GAMES/Bad_Ice_Cream.swf", icon: "🍦", thumb: "/images/bad-ice-cream.jpg", orientation: "landscape", controls: "icecream" },
    { id: "age-of-war", title: "Age of War", swf: "GAMES/age_of_war.swf", icon: "⚔️", thumb: "/images/age-of-war.jpg", orientation: "landscape" }
  ]},
  { id: "estrategia", name: "Estrategia", games: [
    { id: "zombie-trailer-park", title: "Zombie Trailer Park", swf: "GAMES/zombie-trailer-park.swf", icon: "🧟", thumb: "/images/zombie.jpg", orientation: "landscape" },
    { id: "bloons-tower-defence-4", title: "Bloons Tower Defense 4", swf: "GAMES/bloons-tower-defence-4.swf", icon: "🎈", thumb: "/images/bloons-tower.jpg", orientation: "landscape" }
  ]},
  { id: "arcade", name: "Arcade", games: [
    { id: "pacman-multiplayer", title: "Pac-Man", icon: "🟡", thumb: "/images/pacman.jpg", multiplayerOnly: true, soloPlayable: true },
    { id: "worlds-hardest-game", title: "The World's Hardest Game", swf: "GAMES/the-world's-hardest-game.swf", icon: "🟥", thumb: "/images/hard-game.jpg", orientation: "portrait", controls: "dpad" }
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
const CATEGORY_ICONS = {
  todos: "🎮",
  accion: "🔥",
  estrategia: "🧠",
  arcade: "🕹️"
};
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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [logoOpen, setLogoOpen] = useState(false);
  const [search, setSearch] = useState("");
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
  const [pacmanState, setPacmanState] = useState(null);
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
  const [actionPressed, setActionPressed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateSidebar = () => setSidebarOpen(!media.matches);
    updateSidebar();
    if (media.addEventListener) media.addEventListener("change", updateSidebar);
    else media.addListener(updateSidebar);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", updateSidebar);
      else media.removeListener(updateSidebar);
    };
  }, []);

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
      if (message.type === "pacman-state") setPacmanState(message.state);
      if (message.type === "input" && seat === 1) dispatchKey(message.keyCode, message.down, remoteKeysRef.current);
      if (message.type === "signal") handlePeerSignal(message.signal).catch(() => showPeerError("No se pudo conectar la transmisión entre los teléfonos."));
      if (message.type === "media-error" && seat === 2) showPeerError("El anfitrión no pudo compartir la pantalla en este dispositivo.");
      if (message.type === "start") {
        const gameId = message.gameId || "bubble-trouble";
        const game = INITIAL_CATALOGS.flatMap((catalog) => catalog.games).find((item) => item.id === gameId);
        if (!game) { setLobbyStatus("El servidor indicó un juego no disponible."); return; }
        setOnlineStarted(true);
        setRemoteView(!game.multiplayerOnly && seat === 2);
        setLobbyOpen(false);
        setHideBar(false);
        setActiveGame(game);
        setLobbyGame(game);
        if (seat === 2 && !game.multiplayerOnly) {
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
    setPacmanState(null);
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

  useEffect(() => {
    if (!logoOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setLogoOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logoOpen]);

  const sendPacmanDirection = useCallback((direction) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "pacman-input", direction }));
    }
  }, []);

  const openLobby = (game = INITIAL_CATALOGS[0].games[0]) => {
    setLobbyGame(game);
    setLobbyStatus("Crea una sala o ingresa el código de tu amigo.");
    setLobbyOpen(true);
  };

  useEffect(() => {
    let active = true;
    let player;
    if (!activeGame || remoteView || activeGame.multiplayerOnly) return undefined;
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
        await player.load({ url: activeGame.swf, ...options });
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
    fetch("catalogo.json", { cache: "no-cache" })
      .then((response) => response.ok ? response.json() : [])
      .then((data) => {
        if (!Array.isArray(data) || !data.length) return;
        const includesPacman = data.some((catalog) => Array.isArray(catalog.games) && catalog.games.some((game) => game.id === "pacman-multiplayer"));
        if (includesPacman) {
          setCatalogs(data);
          return;
        }
        const arcadeCatalog = data.find((catalog) => catalog.id === "arcade");
        setCatalogs(arcadeCatalog
          ? data.map((catalog) => catalog.id === "arcade"
            ? { ...catalog, games: [...(Array.isArray(catalog.games) ? catalog.games : []), INITIAL_CATALOGS[2].games[0]] }
            : catalog)
          : [...data, INITIAL_CATALOGS[2]]);
      })
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
      for (const code of [...localKeysRef.current]) sendPlayerKey(code, false);
      setActionPressed(false);
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

  const normalizedSearch = search.trim().toLowerCase();
  const matches = (game) => !normalizedSearch || game.title.toLowerCase().includes(normalizedSearch);
  const visibleCatalogs = catalogs
    .filter((catalog) => category === "todos" || category === catalog.id)
    .map((catalog) => ({ ...catalog, games: catalog.games.filter(matches) }))
    .filter((catalog) => catalog.games.length);
  const visibleCount = visibleCatalogs.reduce((count, catalog) => count + catalog.games.length, 0);
  const portraitGame = activeGame?.orientation === "portrait" || activeGame?.title === "Bubble Trouble";
  const landscapeGame = activeGame?.orientation === "landscape";
  const portraitDpadGame = portraitGame && activeGame?.controls === "dpad";

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

  const categories = [{ id: "todos", name: "Todos" }, ...catalogs];
  const directionalCodes = onlineStarted && playerSeat === 2
    ? { up: 87, left: 65, down: 83, right: 68 }
    : { up: 38, left: 37, down: 40, right: 39 };

  return (
    <div className="site-shell">
      <header>
        <div className="brand">
          <button
            className="menu-toggle"
            type="button"
            aria-label={sidebarOpen ? "Ocultar categorías" : "Mostrar categorías"}
            aria-expanded={sidebarOpen}
            aria-controls="game-categories"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <span className="menu-toggle-icon" aria-hidden="true"><span /><span /><span /></span>
          </button>
          <button className="logo-button" type="button" aria-label="Ampliar logo de Daniela Games" onClick={() => setLogoOpen(true)}>
            <img className="logo" src="/images/logo-circular.png" alt="" />
          </button>
          <h1>Daniela Games</h1>
        </div>
        <label className="search-wrap">
          <span className="search-icon" aria-hidden="true" />
          <input className="search" type="search" placeholder="Buscar juego" aria-label="Buscar juego" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </header>

      {logoOpen && (
        <div className="logo-preview" role="dialog" aria-modal="true" aria-label="Logo Daniela Games" onClick={(event) => {
          if (event.target === event.currentTarget) setLogoOpen(false);
        }}>
          <button className="logo-preview-close" type="button" aria-label="Cerrar logo" onClick={() => setLogoOpen(false)}>×</button>
          <img src="/images/logo-circular.png" alt="Logo Daniela Games ampliado" />
        </div>
      )}

      <div className="catalog-layout">
        <button
          className={`sidebar-backdrop${sidebarOpen ? " is-visible" : ""}`}
          type="button"
          aria-label="Cerrar categorías"
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
        />
        <aside id="game-categories" className={`sidebar${sidebarOpen ? " is-open" : " is-closed"}`} aria-label="Categorías de juegos" aria-hidden={!sidebarOpen}>
          <nav className="chips" aria-label="Categorías">
            {categories.map((item) => (
              <button
                key={item.id}
                className="chip"
                type="button"
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id);
                  window.scrollTo({ top: 0 });
                  if (window.innerWidth <= 760) setSidebarOpen(false);
                }}
              >
                <span className="chip-icon" aria-hidden="true">{CATEGORY_ICONS[item.id] || "🎲"}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main>
          {visibleCatalogs.map((catalog) => (
            <section key={catalog.id}>
              <div className="sec-head"><h2>{catalog.name}</h2><span>{catalog.games.length} {catalog.games.length === 1 ? "juego" : "juegos"}</span></div>
              <div className="grid">
                {catalog.games.map((game) => <GameTile key={game.id} game={game} subtitle={catalog.name} onPlay={game.multiplayerOnly && !game.soloPlayable ? () => openLobby(game) : openGame} onMultiplayer={game.multiplayerOnly || game.controls === "icecream" || game.id === "bubble-trouble" || game.title === "Bubble Trouble" ? openLobby : undefined} />)}
              </div>
            </section>
          ))}
          {visibleCount === 0 && <div className="empty">{normalizedSearch ? `No hay juegos que coincidan con “${search}”.` : "Este catálogo todavía no tiene juegos."}</div>}
        </main>
      </div>

      {lobbyOpen && (
        <div className="lobby" role="dialog" aria-modal="true" aria-labelledby="lobbyTitle">
          <div className="lobby-card">
            <h2 id="lobbyTitle">{lobbyGame.title} online</h2>
            <p>{lobbyGame.multiplayerOnly ? "Compite en tiempo real: coman puntos, eviten fantasmas y consigan la puntuación más alta." : "El anfitrión ejecuta el juego y comparte la pantalla; el segundo jugador la ve y envía sus controles."}</p>
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
          portraitDpadGame ? "portrait-dpad-game" : "",
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
            {activeGame.id === "pacman-multiplayer" && <PacmanGame state={pacmanState} playerSeat={playerSeat} solo={!onlineStarted} onDirection={sendPacmanDirection} />}
            {remoteView && <video id="remoteScreen" ref={remoteVideoRef} autoPlay playsInline muted onPlaying={() => setLobbyStatus("")} onClick={(event) => event.currentTarget.play().catch(() => setLobbyStatus("Toca la pantalla para iniciar el video."))} />}
            {remoteView && lobbyStatus && <div className="stream-status" role="status">{lobbyStatus}</div>}
            {hideBar && <button id="reveal" type="button" aria-label="Mostrar barra" onClick={() => setHideBar(false)}>☰</button>}
          </div>
          {(activeGame.controls === "icecream" || activeGame.controls === "dpad") && (
            <div className="landscape-controls" aria-label="Controles táctiles">
              <div className="mobile-dpad" aria-label="Cruceta de movimiento">
                <span />
                <TouchKey label="Arriba" text="▲" code={directionalCodes.up} onDown={startButton} onUp={releaseButton} />
                <span />
                <TouchKey label="Izquierda" text="◀" code={directionalCodes.left} onDown={startButton} onUp={releaseButton} />
                <span />
                <TouchKey label="Derecha" text="▶" code={directionalCodes.right} onDown={startButton} onUp={releaseButton} />
                <span />
                <TouchKey label="Abajo" text="▼" code={directionalCodes.down} onDown={startButton} onUp={releaseButton} />
                <span />
              </div>
              {activeGame.controls === "icecream" && (
                <button
                  className={`action-button${actionPressed ? " pressed" : ""}`}
                  type="button"
                  aria-label="Acción"
                  onPointerDown={(event) => { setActionPressed(true); startButton(event, onlineStarted && playerSeat === 2 ? 70 : 32); }}
                  onPointerUp={(event) => { setActionPressed(false); releaseButton(event, sendPlayerKey); }}
                  onPointerCancel={(event) => { setActionPressed(false); releaseButton(event, sendPlayerKey); }}
                >ACCIÓN</button>
              )}
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
    </div>
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

function GameTile({ game, subtitle, onPlay, onMultiplayer }) {
  return (
    <div className="tile">
      <button className="play" type="button" aria-label={`Jugar ${game.title}`} onClick={() => onPlay(game)}>
        <div className="art" style={!game.thumb ? { backgroundImage: gradient(game.title) } : undefined}>
          {game.thumb ? <img src={game.thumb} alt="" loading="lazy" /> : (game.icon || "🎮")}
        </div>
        <div className="meta"><b>{game.title}</b><small>{subtitle}</small></div>
      </button>
      {onMultiplayer && <button className="multiplayer-cta" type="button" onClick={() => onMultiplayer(game)}>Jugar online</button>}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
