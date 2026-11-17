import React, { useEffect, useRef, useState } from 'react';
import './PacmanGame.css';


export default function PacmanGame() {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(Number(localStorage.getItem('pacman_coop_record') || 350));
  const [level, setLevel] = useState(1);
  const [isCoop, setIsCoop] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [livesJ1, setLivesJ1] = useState(3);
  const [livesJ2, setLivesJ2] = useState(3);

  // Referencias mutables para el bucle del juego sin perder estados
  const stateRef = useRef({
    score: 0,
    level: 1,
    isCoop: false,
    running: false,
    soundOn: true,
    frightTimer: 0,
    animTick: 0,
    players: [],
    ghosts: [],
    map: []
  });

  useEffect(() => {
    stateRef.current.soundOn = soundOn;
  }, [soundOn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const TILE = 24;
    const COLS = 19;
    const ROWS = 21;

    const BASE_MAP = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,3,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,3,1],
      [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
      [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
      [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
      [1,1,1,1,0,1,1,1,2,1,2,1,1,1,0,1,1,1,1],
      [2,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,2],
      [1,1,1,1,0,1,2,1,1,4,1,1,2,1,0,1,1,1,1],
      [2,2,2,2,0,2,2,1,2,2,2,1,2,2,0,2,2,2,2],
      [1,1,1,1,0,1,2,1,1,1,1,1,2,1,0,1,1,1,1],
      [2,2,2,1,0,1,2,2,2,2,2,2,2,1,0,1,2,2,2],
      [1,1,1,1,0,1,2,1,1,1,1,1,2,1,0,1,1,1,1],
      [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
      [1,3,0,1,0,0,0,0,0,2,0,0,0,0,0,1,0,3,1],
      [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
      [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
      [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];

    function beep(freq, duration, type = 'sine', vol = 0.05) {
      if (!stateRef.current.soundOn) return;
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) {}
    }

    function initGame(coop) {
      stateRef.current.isCoop = coop;
      stateRef.current.score = 0;
      stateRef.current.level = 1;
      setScore(0);
      setLevel(1);

      stateRef.current.map = BASE_MAP.map(row => [...row]);
      
      const p1 = {
        id: 1, hasBow: false,
        x: coop ? 8 * TILE + TILE / 2 : 9 * TILE + TILE / 2,
        y: 16 * TILE + TILE / 2,
        dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 },
        speed: 2.2, lives: 3, respawnTimer: 0
      };

      let ps = [p1];
      if (coop) {
        ps.push({
          id: 2, hasBow: true,
          x: 10 * TILE + TILE / 2, y: 16 * TILE + TILE / 2,
          dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 },
          speed: 2.2, lives: 3, respawnTimer: 0
        });
      }
      stateRef.current.players = ps;
      setLivesJ1(3);
      setLivesJ2(coop ? 3 : 0);

      const gConfigs = [
        { name: 'Blinky', color: '#ef4444', gx: 9, gy: 8 },
        { name: 'Pinky',  color: '#f472b6', gx: 8, gy: 10 },
        { name: 'Inky',   color: '#22d3ee', gx: 9, gy: 10 },
        { name: 'Clyde',  color: '#fb923c', gx: 10, gy: 10 }
      ];
      stateRef.current.ghosts = gConfigs.map(g => ({
        ...g,
        x: g.gx * TILE + TILE / 2, y: g.gy * TILE + TILE / 2,
        dir: { x: 0, y: -1 }, speed: 1.75, eaten: false
      }));

      stateRef.current.running = true;
      setIsPlaying(true);
      setGameOver(false);
    }

    // Controles de teclado
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      const p1 = stateRef.current.players[0];
      const p2 = stateRef.current.players[1];

      if (p1) {
        if (e.code === 'ArrowUp' || (!stateRef.current.isCoop && e.code === 'KeyW')) p1.nextDir = { x: 0, y: -1 };
        if (e.code === 'ArrowDown' || (!stateRef.current.isCoop && e.code === 'KeyS')) p1.nextDir = { x: 0, y: 1 };
        if (e.code === 'ArrowLeft' || (!stateRef.current.isCoop && e.code === 'KeyA')) p1.nextDir = { x: -1, y: 0 };
        if (e.code === 'ArrowRight' || (!stateRef.current.isCoop && e.code === 'KeyD')) p1.nextDir = { x: 1, y: 0 };
      }

      if (stateRef.current.isCoop && p2) {
        if (e.code === 'KeyW') p2.nextDir = { x: 0, y: -1 };
        if (e.code === 'KeyS') p2.nextDir = { x: 0, y: 1 };
        if (e.code === 'KeyA') p2.nextDir = { x: -1, y: 0 };
        if (e.code === 'KeyD') p2.nextDir = { x: 1, y: 0 };
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let animId;
    function gameLoop() {
      const s = stateRef.current;
      s.animTick++;

      if (s.running) {
        // Lógica de movimiento y colisiones
        let pellets = 0;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (s.map[r][c] === 0 || s.map[r][c] === 3) pellets++;
          }
        }
        if (pellets === 0) {
          s.level++;
          setLevel(s.level);
          beep(660, 0.25, 'square');
          s.map = BASE_MAP.map(row => [...row]);
        }

        s.players.forEach(p => {
          if (p.lives <= 0) return;
          if (p.respawnTimer > 0) { p.respawnTimer--; return; }

          const cx = Math.floor(p.x / TILE) * TILE + TILE / 2;
          const cy = Math.floor(p.y / TILE) * TILE + TILE / 2;
          if (Math.abs(p.x - cx) < 4 && Math.abs(p.y - cy) < 4) {
            const wallCheck = (nx, ny) => {
              const m = TILE * 0.42;
              const pts = [
                { c: Math.floor((nx - m)/TILE), r: Math.floor((ny - m)/TILE) },
                { c: Math.floor((nx + m)/TILE), r: Math.floor((ny - m)/TILE) },
                { c: Math.floor((nx - m)/TILE), r: Math.floor((ny + m)/TILE) },
                { c: Math.floor((nx + m)/TILE), r: Math.floor((ny + m)/TILE) }
              ];
              return !pts.some(pt => pt.r < 0 || pt.r >= ROWS || pt.c < 0 || pt.c >= COLS || s.map[pt.r][pt.c] === 1);
            };
            if (p.nextDir.x !== 0 || p.nextDir.y !== 0) {
              const testX = cx + p.nextDir.x * 2.5;
              const testY = cy + p.nextDir.y * 2.5;
              if (wallCheck(testX, testY)) {
                p.x = cx; p.y = cy; p.dir = { ...p.nextDir };
              }
            }
          }

          // Mover
          const nx = p.x + p.dir.x * p.speed;
          const ny = p.y + p.dir.y * p.speed;
          const m = TILE * 0.42;
          const pts = [
            { c: Math.floor((nx - m)/TILE), r: Math.floor((ny - m)/TILE) },
            { c: Math.floor((nx + m)/TILE), r: Math.floor((ny - m)/TILE) },
            { c: Math.floor((nx - m)/TILE), r: Math.floor((ny + m)/TILE) },
            { c: Math.floor((nx + m)/TILE), r: Math.floor((ny + m)/TILE) }
          ];
          const canStep = !pts.some(pt => pt.r < 0 || pt.r >= ROWS || pt.c < 0 || pt.c >= COLS || s.map[pt.r][pt.c] === 1);
          if (canStep) { p.x = nx; p.y = ny; }

          if (p.x < 0) p.x = canvas.width;
          if (p.x > canvas.width) p.x = 0;

          // Comer
          const col = Math.floor(p.x / TILE);
          const row = Math.floor(p.y / TILE);
          if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
            if (s.map[row][col] === 0) {
              s.map[row][col] = 2;
              s.score += 10;
              setScore(s.score);
              if (s.score > highScore) {
                setHighScore(s.score);
                localStorage.setItem('pacman_coop_record', s.score);
              }
              beep(440, 0.04, 'triangle', 0.02);
            } else if (s.map[row][col] === 3) {
              s.map[row][col] = 2;
              s.score += 50;
              setScore(s.score);
              s.frightTimer = 320;
              beep(780, 0.18, 'square');
            }
          }
        });

        if (s.frightTimer > 0) s.frightTimer--;

        s.ghosts.forEach(g => {
          const cx = Math.floor(g.x / TILE) * TILE + TILE / 2;
          const cy = Math.floor(g.y / TILE) * TILE + TILE / 2;
          if (Math.abs(g.x - cx) < 3 && Math.abs(g.y - cy) < 3) {
            g.x = cx; g.y = cy;
            const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].filter(d => {
              const tc = Math.floor((cx + d.x * TILE)/TILE);
              const tr = Math.floor((cy + d.y * TILE)/TILE);
              return tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS && s.map[tr][tc] !== 1;
            });
            if (dirs.length > 0) {
              g.dir = dirs[Math.floor(Math.random() * dirs.length)];
            }
          }
          g.x += g.dir.x * g.speed;
          g.y += g.dir.y * g.speed;

          s.players.forEach(p => {
            if (p.lives <= 0 || p.respawnTimer > 0) return;
            if (Math.hypot(p.x - g.x, p.y - g.y) < TILE * 0.7) {
              p.lives--;
              if (p.id === 1) setLivesJ1(p.lives);
              if (p.id === 2) setLivesJ2(p.lives);

              p.x = (p.id === 1 ? 8 : 10) * TILE + TILE / 2;
              p.y = 16 * TILE + TILE / 2;
              p.dir = { x: 0, y: 0 };
              p.nextDir = { x: 0, y: 0 };
              p.respawnTimer = 90;
              beep(160, 0.3, 'sawtooth');

              if (s.players.every(pl => pl.lives <= 0)) {
                s.running = false;
                setIsPlaying(false);
                setGameOver(true);
              }
            }
          });
        });
      }

      // Dibujar en Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const val = s.map[r][c];
          const x = c * TILE; const y = r * TILE;
          if (val === 1) {
            ctx.fillStyle = '#172554';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
            ctx.strokeRect(x+2, y+2, TILE-4, TILE-4);
          } else if (val === 0) {
            ctx.fillStyle = '#fde68a';
            ctx.beginPath(); ctx.arc(x + TILE/2, y + TILE/2, 2.5, 0, Math.PI*2); ctx.fill();
          } else if (val === 3) {
            ctx.fillStyle = '#fb923c';
            ctx.beginPath(); ctx.arc(x + TILE/2, y + TILE/2, 5, 0, Math.PI*2); ctx.fill();
          }
        }
      }

      // Dibujar jugadores
      s.players.forEach(p => {
        if (p.lives <= 0) return;
        if (p.respawnTimer > 0 && Math.floor(p.respawnTimer / 8) % 2 === 0) return;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(0, 0, TILE * 0.42, 0.2, Math.PI * 1.8); ctx.lineTo(0,0); ctx.fill();

        // Moño rosa Ms. Pac-Man (J2 Cooperativo)
        if (p.hasBow) {
          ctx.fillStyle = '#ec4899';
          ctx.beginPath(); ctx.arc(-5, -12, 4, 0, Math.PI * 2); ctx.arc(5, -12, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath(); ctx.arc(0, -12, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      });

      // Dibujar fantasmas
      s.ghosts.forEach(g => {
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.fillStyle = s.frightTimer > 0 ? '#2563eb' : g.color;
        ctx.beginPath();
        ctx.arc(0, -2, TILE * 0.42, Math.PI, 0);
        ctx.lineTo(TILE * 0.42, TILE * 0.42);
        ctx.lineTo(-TILE * 0.42, TILE * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      animId = requestAnimationFrame(gameLoop);
    }

    animId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="pacman-cabinet">
      <div className="pacman-hud-top">
        <div className="stat">
          <span className="stat-label">PUNTOS</span>
          <span className="stat-val">{String(score).padStart(5, '0')}</span>
        </div>
        <div className="stat">
          <span className="stat-label">RÉCORD</span>
          <span className="stat-val">{String(highScore).padStart(5, '0')}</span>
        </div>
        <button className="btn-sound" onClick={() => setSoundOn(!soundOn)}>
          {soundOn ? '🔊 SONIDO' : '🔇 MUDO'}
        </button>
      </div>

      <div className="pacman-board-container">
        <canvas ref={canvasRef} width="456" height="504" className="pacman-canvas-real" />

        {!isPlaying && (
          <div className="pacman-overlay">
            <h2 className="pacman-title">{gameOver ? 'GAME OVER' : 'PAC-MAN COOP'}</h2>
            
            <div className="mode-selector">
              <button className={`mode-btn ${!isCoop ? 'active' : ''}`} onClick={() => setIsCoop(false)}>
                1 JUGADOR<br/><span style={{fontSize:'7px'}}>CLÁSICO</span>
              </button>
              <button className={`mode-btn ${isCoop ? 'active' : ''}`} onClick={() => setIsCoop(true)}>
                2 JUGADORES<br/><span style={{fontSize:'7px'}}>COOPERATIVO 🎀</span>
              </button>
            </div>

            <button className="btn-start" onClick={() => {
              const canvas = canvasRef.current;
              // Reiniciar estado
              window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
            }}>
              JUGAR PARTIDA
            </button>

            <p className="controls-hint">
              {!isCoop ? 'Usa las FLECHAS del teclado' : 'J1: FLECHAS 🟡 | J2: W A SD 🎀'}
            </p>
          </div>
        )}
      </div>

      <div className="pacman-hud-bottom">
        <div className="lives-display">
          <span>🟡 J1: {'❤️'.repeat(Math.max(0, livesJ1))}</span>
          {isCoop && <span style={{marginLeft: '12px'}}>🎀 J2: {'❤️'.repeat(Math.max(0, livesJ2))}</span>}
        </div>
        <span className="level-badge">NIVEL {level}</span>
      </div>
    </div>
  );
}