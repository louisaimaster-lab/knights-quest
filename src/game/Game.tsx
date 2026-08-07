import React, { useEffect, useRef, useState } from "react";
import { GameEngine } from "./Engine";
import { COLORS } from "./constants";
import { SavedRunState } from "./types";

interface SaveFile {
  id: string;
  name: string;
  color: string;
  maxFloorReached: number;
  savedRun?: SavedRunState;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [fps, setFps] = useState<number>(60);
  const [hz, setHz] = useState<number>(60);

  const [appState, setAppState] = useState<"menu" | "selectSave" | "playing">(
    "menu",
  );
  const [saves, setSaves] = useState<SaveFile[]>([]);
  const [currentSave, setCurrentSave] = useState<SaveFile | null>(null);

  useEffect(() => {
    // load saves
    const stored = localStorage.getItem("deep_mine_saves");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSaves(parsed);
          return;
        }
      } catch (e) {}
    }
    // Default initial save so user is never stuck without a save slot
    const defaultSave: SaveFile = {
      id: Date.now().toString(),
      name: "Knight 1",
      color: "#ea580c",
      maxFloorReached: 1,
    };
    setSaves([defaultSave]);
    localStorage.setItem("deep_mine_saves", JSON.stringify([defaultSave]));
  }, []);

  const saveToStorage = (newSaves: SaveFile[]) => {
    setSaves(newSaves);
    localStorage.setItem("deep_mine_saves", JSON.stringify(newSaves));
  };

  const createNewSave = () => {
    const newSave: SaveFile = {
      id: Date.now().toString(),
      name: `Knight ${saves.length + 1}`,
      color: "#ea580c", // default orange
      maxFloorReached: 1,
    };
    saveToStorage([...saves, newSave]);
  };

  const deleteSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this Knight save slot?")) {
      const updated = saves.filter((s) => s.id !== id);
      saveToStorage(updated);
      if (currentSave?.id === id) {
        setCurrentSave(null);
      }
    }
  };

  const updateCurrentSaveColor = (color: string) => {
    if (!currentSave) return;
    const updated = { ...currentSave, color };
    setCurrentSave(updated);
    saveToStorage(saves.map((s) => (s.id === updated.id ? updated : s)));
    if (engineRef.current) {
      engineRef.current.state.player.playerColor = color;
    }
  };

  const startGame = (save: SaveFile, newRunOverride: boolean = false) => {
    setCurrentSave(save);
    setAppState("playing");

    if (engineRef.current) {
      engineRef.current.isMenuBackground = false;

      if (!newRunOverride && save.savedRun && save.savedRun.hasActiveRun) {
        // Restore active saved run stats & equipment safely!
        engineRef.current.restoreRunState(save.savedRun);
      } else {
        // Fresh new run!
        engineRef.current.state = engineRef.current.getInitialState();
        engineRef.current.initFloor(1);
      }

      engineRef.current.isMenuBackground = false;
      engineRef.current.state.player.playerColor = save.color;
      engineRef.current.state.isPaused = false;
      engineRef.current.state.isFloorComplete = false;
      engineRef.current.state.transitionState = "none";
    }
    setTimeout(() => {
      containerRef.current?.focus();
    }, 50);
  };

  useEffect(() => {
    const handleFloorCompleted = (e: any) => {
      const floor = e.detail?.maxFloor;
      if (floor && currentSave) {
        if (floor > currentSave.maxFloorReached) {
          const updated = { ...currentSave, maxFloorReached: floor };
          setCurrentSave(updated);
          setSaves((prev) => {
            const newSaves = prev.map((s) =>
              s.id === updated.id ? updated : s,
            );
            localStorage.setItem("deep_mine_saves", JSON.stringify(newSaves));
            return newSaves;
          });
        }
      }
    };

    const handleSaveAndExit = () => {
      if (engineRef.current && currentSave) {
        const runData = engineRef.current.serializeRunState();
        const updatedSave: SaveFile = { ...currentSave, savedRun: runData };
        setCurrentSave(updatedSave);
        setSaves((prev) => {
          const newSaves = prev.map((s) => (s.id === updatedSave.id ? updatedSave : s));
          localStorage.setItem("deep_mine_saves", JSON.stringify(newSaves));
          return newSaves;
        });
        engineRef.current.initMenuBackground();
        setAppState("menu");
      }
    };

    const handleExitToMenu = () => {
      if (engineRef.current) {
        engineRef.current.initMenuBackground();
        setAppState("menu");
      }
    };

    const handlePlayerDied = () => {
      if (currentSave) {
        const updatedSave: SaveFile = { ...currentSave, savedRun: undefined };
        setCurrentSave(updatedSave);
        setSaves((prev) => {
          const newSaves = prev.map((s) => (s.id === updatedSave.id ? updatedSave : s));
          localStorage.setItem("deep_mine_saves", JSON.stringify(newSaves));
          return newSaves;
        });
      }
    };

    window.addEventListener("floorCompleted", handleFloorCompleted);
    window.addEventListener("saveAndExit", handleSaveAndExit);
    window.addEventListener("exitToMenu", handleExitToMenu);
    window.addEventListener("playerDied", handlePlayerDied);
    return () => {
      window.removeEventListener("floorCompleted", handleFloorCompleted);
      window.removeEventListener("saveAndExit", handleSaveAndExit);
      window.removeEventListener("exitToMenu", handleExitToMenu);
      window.removeEventListener("playerDied", handlePlayerDied);
    };
  }, [currentSave]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Force focus so iframe doesn't gobble up keys
    containerRef.current.focus();

    const engine = new GameEngine();
    engineRef.current = engine;
    engine.initMenuBackground();

    // Set up canvas context
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    engine.ctx = ctx;

    // Disable anti-aliasing for pixel art feel
    ctx.imageSmoothingEnabled = false;

    // Resize handler
    const updateSize = () => {
      if (!containerRef.current) return;
      engine.canvasWidth = containerRef.current.clientWidth;
      engine.canvasHeight = containerRef.current.clientHeight;
      canvas.width = engine.canvasWidth;
      canvas.height = engine.canvasHeight;
      ctx.imageSmoothingEnabled = false; // Need to reset after resize
    };
    updateSize();
    window.addEventListener("resize", updateSize);

    // Inputs
    const handleKeyDown = (e: KeyboardEvent) => {
      engine.state.keys[e.key] = true;
      if (e.key.length === 1) engine.state.keys[e.key.toLowerCase()] = true; // Handle caps lock
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      engine.state.keys[e.key] = false;
      if (e.key.length === 1) engine.state.keys[e.key.toLowerCase()] = false;
    };
    const handleMouseDown = (e: MouseEvent) => {
      engine.state.mouse.down = true;
      engine.state.mouse.clicked = true;
      // DO NOT prevent default, as that prevents the iframe/container from receiving keyboard focus natively on click
      containerRef.current?.focus();
    };
    const handleMouseUp = (e: MouseEvent) => {
      engine.state.mouse.down = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      engine.state.mouse.x = e.clientX - rect.left;
      engine.state.mouse.y = e.clientY - rect.top;
    };

    // Support touch
    const handleTouchStart = (e: TouchEvent) => {
      engine.state.mouse.down = true;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      engine.state.mouse.down = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    // Game loop with a Fixed Timestep to ensure consistent speed across different monitor refresh rates (60Hz vs 144Hz/240Hz)
    let animationFrameId: number;
    let lastTime = performance.now();
    let accumulator = 0;
    const dt = 1000 / 60; // 60 updates per second (16.67ms per physics tick)

    // Live refresh-rate (FPS) tracker variables
    let frameCount = 0;
    let lastFpsUpdateTime = performance.now();
    // Estimate the display's true refresh rate from actual frame deltas (median of recent intervals)
    const frameDeltas: number[] = [];
    let lastDeltaTime = lastTime;
    let hz = 60;

    const loop = (currentTime: number = performance.now()) => {
      let deltaTime = currentTime - lastTime;
      
      // Cap deltaTime to avoid "spiral of death" during major lag spikes or tab suspensions
      if (deltaTime > 100) {
        deltaTime = 100;
      }
      
      lastTime = currentTime;
      accumulator += deltaTime;

      // Run as many fixed 16.67ms physics steps as have accumulated
      while (accumulator >= dt) {
        engine.update();
        accumulator -= dt;
      }

      // Draw once per frame (smooth rendering matched to the native refresh rate)
      engine.draw();

      // Track the actual running refresh rate / FPS
      frameCount++;
      // Estimate display refresh rate from recent frame intervals (median, robust to spikes)
      const frameDelta = currentTime - lastDeltaTime;
      lastDeltaTime = currentTime;
      frameDeltas.push(frameDelta);
      if (frameDeltas.length > 30) frameDeltas.shift();
      if (frameDeltas.length >= 5) {
        const sorted = [...frameDeltas].sort((a, b) => a - b);
        const medianDelta = sorted[Math.floor(sorted.length / 2)];
        if (medianDelta > 0) hz = Math.round(1000 / medianDelta);
      }
      const elapsed = currentTime - lastFpsUpdateTime;
      if (elapsed >= 500) { // Update FPS counter every 500ms
        const calculatedFps = Math.round((frameCount * 1000) / elapsed);
        setFps(calculatedFps);
        setHz(hz);
        frameCount = 0;
        lastFpsUpdateTime = currentTime;
      }

      animationFrameId = window.requestAnimationFrame(loop);
    };
    loop();


    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="w-full h-screen bg-[#090d16] text-white font-mono overflow-hidden relative select-none flex flex-col focus:outline-none"
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none z-0"
        style={{
          backgroundImage: "radial-gradient(#38bdf8 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      ></div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          imageRendering: "pixelated",
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />

      {appState === "playing" && showInfo && (
        <div className="absolute top-20 right-6 bg-slate-900/90 border border-slate-700 p-4 w-60 backdrop-blur-none z-20 shadow-2xl rounded-md">
          <div className="absolute inset-1 border border-cyan-500/20 rounded pointer-events-none"></div>
          <button
            className="absolute top-2 right-2 text-slate-400 hover:text-white text-sm font-bold"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(false);
            }}
          >
            ✕
          </button>
          <div className="text-xs text-cyan-400 mb-2 font-bold tracking-wider pointer-events-none flex items-center gap-1">
            <span>⚔</span> CONTROLS & INFO
          </div>
          <ul className="text-xs space-y-1.5 opacity-90 pointer-events-none text-slate-300">
            <li>• W/A/S/D or Arrows to Move</li>
            <li>• Click to Attack / Use Item</li>
            <li>• Keys 1, 2, 3 to Switch Hotbar</li>
            <li>• F to Pick Up / Swap Items</li>
            <li className="text-cyan-300 font-bold">• Find the purple exit gate</li>
          </ul>
        </div>
      )}

      {appState === "playing" && !showInfo && (
        <button
          className="absolute top-20 right-6 bg-slate-900/90 border border-slate-700 text-cyan-400 px-3 py-1.5 text-xs backdrop-blur-none z-20 hover:bg-slate-800 font-bold rounded shadow-lg flex items-center gap-1"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(true);
          }}
        >
          <span>📜</span> Controls
        </button>
      )}

      <div className="absolute bottom-0 left-0 w-full flex justify-between text-[10px] opacity-75 px-4 pb-2 border-t border-[#7c4a1e] pt-2 bg-[#120d1a] z-20 font-bold tracking-widest pointer-events-none text-amber-200">
        <span>FPS: {fps} // HZ: {hz} // LAT: 42.122 // SECURE CONNECTION</span>
        <span>VER: 1.0.0-TERRARIA</span>
      </div>

      {appState === "menu" && (
        <div className="absolute inset-0 bg-black/20 z-30 flex flex-col items-center justify-center p-8 backdrop-blur-none">
          <div className="p-8 bg-slate-900/50 border-2 border-cyan-500/60 rounded-xl flex flex-col items-center max-w-md w-full shadow-[0_0_30px_rgba(6,182,212,0.25)] relative">
            <div className="absolute inset-1 border border-cyan-400/30 rounded-lg pointer-events-none"></div>
            <h1 className="text-5xl text-white font-bold mb-2 tracking-widest text-center drop-shadow-md">
              KNIGHT'S <span className="text-cyan-400">QUEST</span>
            </h1>
            <p className="text-cyan-200/80 mb-8 font-semibold tracking-wide">Descend. Survive. Conquer.</p>
            <div className="space-y-3 flex flex-col w-full px-4">
              <button
                onClick={() => {
                  const targetSave = saves[0] || {
                    id: Date.now().toString(),
                    name: "Knight 1",
                    color: "#ea580c",
                    maxFloorReached: 1,
                  };
                  startGame(targetSave, false);
                }}
                className="px-6 py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xl transition-all border-2 border-cyan-300 rounded-lg shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 text-center"
              >
                PLAY GAME
              </button>
              <button
                onClick={() => setAppState("selectSave")}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold text-sm transition-all border border-slate-600 rounded-lg text-center"
              >
                SELECT SAVES / CUSTOMIZE
              </button>
            </div>
          </div>
        </div>
      )}

      {appState === "selectSave" && (
        <div className="absolute inset-0 bg-black/40 z-30 flex flex-col items-center p-8 backdrop-blur-none overflow-y-auto">
          <h1 className="text-4xl text-cyan-400 font-bold mt-8 mb-6 drop-shadow-md tracking-wider">
            SELECT KNIGHT SAVE
          </h1>
          <div className="flex flex-wrap gap-6 mb-8 justify-center max-w-4xl">
            {saves.map((save) => {
              const hasActiveRun = save.savedRun && save.savedRun.hasActiveRun;
              return (
                <div
                  key={save.id}
                  className="p-6 bg-slate-900/90 border-2 border-slate-700 rounded-xl flex flex-col items-center min-w-[270px] shadow-lg relative group hover:border-cyan-500/80 transition-all"
                >
                  <div className="absolute inset-1 border border-slate-700/50 rounded-lg pointer-events-none"></div>

                  {/* Delete Save Button */}
                  <button
                    onClick={(e) => deleteSave(save.id, e)}
                    className="absolute top-3 right-3 text-red-400/70 hover:text-red-400 bg-red-950/40 hover:bg-red-900/80 border border-red-800/60 p-1.5 rounded text-xs transition-colors z-20"
                    title="Delete Save Slot"
                  >
                    🗑
                  </button>

                  <div className="w-16 h-16 mb-3 relative bg-slate-950 border-2 border-slate-700 rounded-lg flex items-center justify-center p-1 shadow-inner">
                    {/* Knight Helmet Preview */}
                    <div className="relative w-8 h-8 flex flex-col items-center">
                      <div className="w-7 h-7 bg-slate-300 rounded-t-md relative border border-slate-500 shadow-inner">
                        <div className="absolute top-2 inset-x-1 h-1.5 bg-slate-950 flex items-center justify-center">
                          <div className="w-2 h-[2px]" style={{ backgroundColor: save.color }}></div>
                        </div>
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-1.5 h-3 bg-slate-950"></div>
                      </div>
                    </div>
                  </div>
                  <h2 className="text-xl font-bold mb-1 text-slate-100">{save.name}</h2>
                  <p className="text-xs text-cyan-400 mb-2 font-semibold">
                    Max Floor: {save.maxFloorReached}
                  </p>

                  {/* Character Color Customization Swatches */}
                  <p className="text-xs text-slate-400 mb-1.5 font-bold">Visor Accent:</p>
                  <div className="flex space-x-1.5 mb-4">
                    {[
                      "#ea580c", // Orange
                      "#3b82f6", // Royal Blue
                      "#22c55e", // Emerald
                      "#a855f7", // Purple
                      "#eab308", // Gold
                      "#ef4444", // Crimson
                      "#06b6d4", // Cyan
                      "#64748b", // Steel
                    ].map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          const updatedSaves = saves.map((s) =>
                            s.id === save.id ? { ...s, color } : s,
                          );
                          saveToStorage(updatedSaves);
                        }}
                        className={`w-4 h-4 rounded-full border transition-transform ${save.color === color ? "border-cyan-300 scale-125 z-10 shadow-md ring-2 ring-cyan-400/50" : "border-transparent opacity-70 hover:opacity-100"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  {hasActiveRun ? (
                    <div className="w-full space-y-2">
                      <button
                        onClick={() => startGame(save, false)}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold w-full rounded-lg border border-emerald-400 shadow-md transition-all text-sm"
                      >
                        CONTINUE (FLOOR {save.savedRun?.floor})
                      </button>
                      <button
                        onClick={() => startGame(save, true)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold w-full rounded border border-slate-600 text-xs transition-colors"
                      >
                        Start Fresh Run (Floor 1)
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startGame(save, true)}
                      className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold w-full rounded-lg border border-cyan-400 shadow-md transition-all text-sm"
                    >
                      ENTER CAVE (FLOOR 1)
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex space-x-4">
            <button
              onClick={createNewSave}
              className="px-6 py-3 bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/50 hover:bg-cyan-500/30 rounded-lg transition-colors"
            >
              CREATE NEW KNIGHT
            </button>
            <button
              onClick={() => setAppState("menu")}
              className="px-6 py-3 text-slate-400 hover:text-slate-200 rounded-lg border border-transparent hover:border-slate-700 transition-colors"
            >
              BACK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
