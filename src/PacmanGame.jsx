import { useCallback, useEffect, useRef, useState } from "react";
import PACMAN_LAYOUT from "./pacman-layout.json";

const KEY_DIRECTIONS = {
  ArrowUp: "up",
  w: "up",
  ArrowDown: "down",
  s: "down",
  ArrowLeft: "left",
  a: "left",
  ArrowRight: "right",
  d: "right"
};
const DIRECTIONS = { up: -Math.PI / 2, right: 0, down: Math.PI / 2, left: Math.PI };
const MOVEMENTS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const COLORS = ["#ffe23b", "#ff72b6"];
const MOVE_ANIMATION_MS = 200;

function createSoloState() {
  const pellets = {};
  PACMAN_LAYOUT.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === "." || cell === "o") pellets[`${x},${y}`] = cell === "o" ? 5 : 1;
    });
  });
  return {
    players: { 1: { x: 1, y: 1, direction: "right", score: 0, lives: 3 } },
    ghosts: [{ x: 6, y: 6 }, { x: 6, y: 7 }],
    pellets,
    remaining: Object.keys(pellets).length,
    powerTicks: 0,
    tick: 0,
    gameOver: false,
    winner: null
  };
}

function isWall(x, y) {
  return !PACMAN_LAYOUT[y] || PACMAN_LAYOUT[y][x] === "#";
}

function advanceSoloState(state, direction) {
  if (!state || state.gameOver) return state;
  const player = { ...state.players[1], direction };
  const ghosts = state.ghosts.map((ghost) => ({ ...ghost }));
  const next = {
    ...state,
    players: { 1: player },
    ghosts,
    pellets: { ...state.pellets },
    tick: state.tick + 1,
    powerTicks: Math.max(0, state.powerTicks - 1)
  };
  const movement = MOVEMENTS[direction];
  const nextX = player.x + movement.x;
  const nextY = player.y + movement.y;
  if (!isWall(nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
    const pelletKey = `${nextX},${nextY}`;
    const points = next.pellets[pelletKey];
    if (points) {
      delete next.pellets[pelletKey];
      player.score += points;
      if (points === 5) next.powerTicks = 35;
    }
  }
  next.remaining = Object.keys(next.pellets).length;

  if (next.tick % 2 === 0) {
    for (const ghost of ghosts) {
      const options = Object.values(MOVEMENTS)
        .map((step) => ({ x: ghost.x + step.x, y: ghost.y + step.y }))
        .filter((position) => !isWall(position.x, position.y));
      if (options.length) Object.assign(ghost, options[Math.floor(Math.random() * options.length)]);
    }
  }

  for (let index = 0; index < ghosts.length; index += 1) {
    const ghost = ghosts[index];
    if (player.lives <= 0 || player.x !== ghost.x || player.y !== ghost.y) continue;
    if (next.powerTicks > 0) {
      player.score += 25;
      Object.assign(ghost, [{ x: 6, y: 6 }, { x: 6, y: 7 }][index]);
    } else {
      player.lives -= 1;
      Object.assign(player, { x: 1, y: 1, direction: "right" });
    }
  }

  if (next.remaining === 0 || player.lives <= 0) {
    next.gameOver = true;
    next.winner = next.remaining === 0 && player.lives > 0 ? 1 : null;
  }
  return next;
}

function interpolatePosition(previous, current, progress) {
  if (!previous || Math.abs(current.x - previous.x) > 1 || Math.abs(current.y - previous.y) > 1) return current;
  return {
    ...current,
    x: previous.x + (current.x - previous.x) * progress,
    y: previous.y + (current.y - previous.y) * progress
  };
}

function drawPacman(ctx, x, y, radius, color, direction, time) {
  const angle = DIRECTIONS[direction] || 0;
  const mouth = .1 + (Math.sin(time / 100) + 1) * .19;
  const fill = ctx.createRadialGradient(
    x - radius * .36, y - radius * .4, radius * .04,
    x, y, radius * 1.08
  );
  fill.addColorStop(0, "#fff8a8");
  fill.addColorStop(.3, color);
  fill.addColorStop(1, "#f5a900");
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * .6;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, radius, angle + mouth, angle + Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,210,.8)";
  ctx.lineWidth = Math.max(1, radius * .045);
  ctx.stroke();
  const eyeAngle = angle - .62;
  const eyeX = x + Math.cos(eyeAngle) * radius * .48;
  const eyeY = y + Math.sin(eyeAngle) * radius * .48;
  ctx.fillStyle = "#fffef3";
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, radius * .13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#182044";
  ctx.beginPath();
  ctx.arc(eyeX + Math.cos(angle) * radius * .035, eyeY + Math.sin(angle) * radius * .035, radius * .065, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGhost(ctx, x, y, radius, color, time, phase, frightened) {
  const bob = Math.sin(time / 180 + phase) * radius * .08;
  const top = y + bob;
  const fill = ctx.createLinearGradient(x - radius, top - radius, x + radius, top + radius);
  fill.addColorStop(0, "#fff2f5");
  fill.addColorStop(.25, color);
  fill.addColorStop(1, frightened ? "#3d75ff" : "#9c2c88");
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * .55;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - radius, top + radius * .78);
  ctx.lineTo(x - radius, top);
  ctx.arc(x, top, radius, Math.PI, 0);
  ctx.lineTo(x + radius, top + radius * .78);
  for (let scallop = 0; scallop < 4; scallop += 1) {
    const startX = x + radius - scallop * radius * .5;
    const endX = startX - radius * .5;
    const wave = Math.sin(time / 125 + phase + scallop) * radius * .08;
    ctx.quadraticCurveTo((startX + endX) / 2, top + radius * .58 + wave, endX, top + radius * .78);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = Math.max(1, radius * .055);
  ctx.beginPath();
  ctx.arc(x - radius * .03, top - radius * .04, radius * .77, Math.PI * 1.18, Math.PI * 1.83);
  ctx.stroke();
  const blinking = Math.sin(time / 1300 + phase) > .985;
  const eyeHeight = radius * (blinking ? .05 : .25);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x - radius * .3, top - radius * .08, radius * .2, eyeHeight, 0, 0, Math.PI * 2);
  ctx.ellipse(x + radius * .3, top - radius * .08, radius * .2, eyeHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!frightened && !blinking) {
    const look = Math.sin(time / 480 + phase) * radius * .035;
    ctx.fillStyle = "#19264b";
    ctx.beginPath();
    ctx.arc(x - radius * .27 + look, top - radius * .06, radius * .085, 0, Math.PI * 2);
    ctx.arc(x + radius * .33 + look, top - radius * .06, radius * .085, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoard(canvas, state, previousState, progress, time) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const columns = PACMAN_LAYOUT[0].length;
  const rows = PACMAN_LAYOUT.length;
  const tile = Math.min(width / columns, height / rows);
  const offsetX = (width - columns * tile) / 2;
  const offsetY = (height - rows * tile) / 2;
  const center = (column, row) => ({
    x: offsetX + (column + .5) * tile,
    y: offsetY + (row + .5) * tile
  });

  ctx.fillStyle = "#06112c";
  ctx.fillRect(offsetX, offsetY, columns * tile, rows * tile);

  PACMAN_LAYOUT.forEach((line, row) => {
    [...line].forEach((cell, column) => {
      const { x, y } = center(column, row);
      if (cell === "#") {
        const inset = tile * .07;
        ctx.fillStyle = "#123fba";
        ctx.strokeStyle = "#237bff";
        ctx.lineWidth = Math.max(1, tile * .055);
        const wallX = offsetX + column * tile + inset;
        const wallY = offsetY + row * tile + inset;
        const wallSize = tile - inset * 2;
        ctx.fillRect(wallX, wallY, wallSize, wallSize);
        ctx.strokeRect(wallX, wallY, wallSize, wallSize);
      } else {
        const pellet = state?.pellets?.[`${column},${row}`];
        if (pellet) {
          ctx.fillStyle = "#ffe6a3";
          ctx.beginPath();
          const radius = pellet > 1 ? tile * .18 : tile * .075;
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  });

  state?.ghosts?.forEach((ghost, index) => {
    const position = interpolatePosition(previousState?.ghosts?.[index], ghost, progress);
    const { x, y } = center(position.x, position.y);
    const frightened = state.powerTicks > 0;
    drawGhost(ctx, x, y, tile * .34, frightened ? "#57b8ff" : ["#fa4e70", "#ff9f3f", "#d06bff"][index % 3], time, index * 1.8, frightened);
  });
  Object.entries(state?.players || {}).forEach(([seat, player]) => {
    const position = interpolatePosition(previousState?.players?.[seat], player, progress);
    const { x, y } = center(position.x, position.y);
    drawPacman(ctx, x, y, tile * .38, COLORS[Number(seat) - 1] || COLORS[0], player.direction, time);
  });
}

export default function PacmanGame({ state, playerSeat, solo = false, onDirection }) {
  const canvasRef = useRef(null);
  const directionRef = useRef("right");
  const [soloState, setSoloState] = useState(createSoloState);
  const renderedState = solo ? soloState : state;
  const seat = solo ? 1 : playerSeat;
  const motionRef = useRef({ from: renderedState, to: renderedState, startedAt: 0 });
  const opponentSeat = seat === 1 ? 2 : 1;
  const player = renderedState?.players?.[seat];
  const opponent = renderedState?.players?.[opponentSeat];
  const setDirection = useCallback((direction) => {
    if (solo) directionRef.current = direction;
    else onDirection(direction);
  }, [solo, onDirection]);

  useEffect(() => {
    if (!solo) return undefined;
    const interval = window.setInterval(() => {
      setSoloState((current) => advanceSoloState(current, directionRef.current));
    }, MOVE_ANIMATION_MS);
    return () => window.clearInterval(interval);
  }, [solo]);

  useEffect(() => {
    const motion = motionRef.current;
    motion.from = motion.to || renderedState;
    motion.to = renderedState;
    motion.startedAt = performance.now();
  }, [renderedState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frame;
    let active = true;
    const render = (now) => {
      if (!active) return;
      const motion = motionRef.current;
      const progress = motion.startedAt
        ? Math.min(1, (now - motion.startedAt) / MOVE_ANIMATION_MS)
        : 1;
      const easedProgress = progress * progress * (3 - 2 * progress);
      drawBoard(canvas, motion.to, motion.from, easedProgress, now);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const direction = KEY_DIRECTIONS[event.key];
      if (!direction) return;
      event.preventDefault();
      setDirection(direction);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setDirection]);

  return (
    <div className="pacman-game">
      <div className="pacman-scorebar">
        <div><span className="player-dot player-one" />Tú <b>{player?.score || 0}</b><small>♥ {player?.lives ?? 3}</small></div>
        {!solo && <div><span className="player-dot player-two" />Rival <b>{opponent?.score || 0}</b><small>♥ {opponent?.lives ?? 3}</small></div>}
        <div className="pacman-remaining">{solo ? "Individual" : `Puntos: ${renderedState?.remaining ?? "…"}`}</div>
      </div>
      <canvas className="pacman-canvas" ref={canvasRef} aria-label={solo ? "Laberinto individual de Pac-Man" : "Laberinto multijugador de Pac-Man"} />
      {renderedState?.gameOver && (
        <div className="pacman-result" role="status">
          {solo ? (renderedState.winner ? "¡Ganaste!" : "Fin de la partida") : renderedState.winner === playerSeat ? "¡Ganaste!" : renderedState.winner ? "¡Ganó tu rival!" : "¡Empate!"}
        </div>
      )}
      {!renderedState && <div className="pacman-waiting" role="status">Conectando la partida…</div>}
      <div className="pacman-controls" aria-label="Controles táctiles">
        <span />
        <button type="button" aria-label="Arriba" onClick={() => setDirection("up")}>▲</button>
        <span />
        <button type="button" aria-label="Izquierda" onClick={() => setDirection("left")}>◀</button>
        <button type="button" aria-label="Abajo" onClick={() => setDirection("down")}>▼</button>
        <button type="button" aria-label="Derecha" onClick={() => setDirection("right")}>▶</button>
      </div>
      <p className="pacman-help">Flechas o WASD para moverte. Come los puntos y evita a los fantasmas.</p>
    </div>
  );
}
