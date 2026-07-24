import React, { useEffect, useRef, useState } from "react";
import { GameEngine } from "./Engine";
import { COLORS } from "./constants";

interface SaveFile {
  id: string;
  name: string;
  color: string;
  maxFloorReached: number;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [fps, setFps] = useState<number>(60);

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
        setSaves(JSON.parse(stored));
      } catch (e) {}
    }
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

  const updateCurrentSaveColor = (color: string) => {
    if (!currentSave) return;
    const updated = { ...currentSave, color };
    setCurrentSave(updated);
    saveToStorage(saves.map((s) => (s.id === updated.id ? updated : s)));
    if (engineRef.current) {
      engineRef.current.state.player.playerColor = color;
    }
  };

  const startGame = (save: SaveFile) => {
    setCurrentSave(save);
    setAppState("playing");

    if (engineRef.current) {
      engineRef.current.state.player.playerColor = save.color;
      engineRef.current.state.isPaused = false;
      // If you want to load floor, we could engineRef.current.initFloor(save.maxFloorReached), but standard roguelike starts at 1
      engineRef.current.state = engineRef.current.getInitialState();
      engineRef.current.state.player.playerColor = save.color;
      engineRef.current.initFloor(1);
    }
    setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
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
    window.addEventListener("floorCompleted", handleFloorCompleted);
    return () =>
      window.removeEventListener("floorCompleted", handleFloorCompleted);
  }, [currentSave]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Force focus so iframe doesn't gobble up keys
    containerRef.current.focus();

    const engine = new GameEngine();
    engineRef.current = engine;
    engine.state.isPaused = true;

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
      const elapsed = currentTime - lastFpsUpdateTime;
      if (elapsed >= 500) { // Update FPS counter every 500ms
        const calculatedFps = Math.round((frameCount * 1000) / elapsed);
        setFps(calculatedFps);
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
      className="w-full h-screen bg-gradient-to-b from-[#2d1305] to-[#0a0502] text-white font-mono overflow-hidden relative border-8 border-[#2d1b0d] select-none flex flex-col focus:outline-none"
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none z-0"
        style={{
          backgroundImage: "radial-gradient(#8a4a2a 1px, transparent 1px)",
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
        <div className="absolute top-20 right-6 bg-black/40 border-l-4 border-cyan-500 p-4 w-56 backdrop-blur-sm z-20">
          <button
            className="absolute top-2 right-2 text-white/50 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(false);
            }}
          >
            ✕
          </button>
          <div className="text-[10px] text-cyan-400 mb-1 font-bold pointer-events-none">
            CONTROLS & INFO
          </div>
          <ul className="text-[11px] space-y-2 opacity-90 pointer-events-none">
            <li>• W/A/S/D or Arrows to Move</li>
            <li>• Click to Attack</li>
            <li className="text-yellow-400">• Find the purple exit</li>
          </ul>
        </div>
      )}

      {appState === "playing" && !showInfo && (
        <button
          className="absolute top-20 right-6 bg-black/40 border border-cyan-500/50 text-cyan-400 p-2 text-xs backdrop-blur-sm z-20 hover:bg-cyan-500/20"
          onClick={(e) => {
            e.stopPropagation();
            setShowInfo(true);
          }}
        >
          ⓘ Info
        </button>
      )}

      <div className="absolute bottom-0 left-0 w-full flex justify-between text-[10px] opacity-60 px-4 pb-2 border-t border-white/10 pt-2 bg-[#0a0a12] z-20 font-bold tracking-widest pointer-events-none">
        <span>FPS: {fps} // HZ: {fps} // LAT: 42.122 // SECURE CONNECTION</span>
        <span>VER: 0.9.1-CAVE</span>
      </div>

      {appState === "menu" && (
        <div className="absolute inset-0 bg-black/80 z-30 flex flex-col items-center justify-center p-8 backdrop-blur-sm">
          <h1 className="text-6xl text-white font-bold mb-2 tracking-widest drop-shadow-lg text-center shadow-black">
            KNIGHT'S <span className="text-cyan-500">QUEST</span>
          </h1>
          <p className="text-gray-400 mb-12">Descend. Survive. Conquer.</p>
          <div className="space-y-4 flex flex-col w-64">
            <button
              onClick={() => setAppState("selectSave")}
              className="px-6 py-4 bg-white text-black font-bold text-xl hover:bg-gray-200 transition-colors border-l-4 border-cyan-500"
            >
              PLAY GAME
            </button>
          </div>
        </div>
      )}

      {appState === "selectSave" && (
        <div className="absolute inset-0 bg-black/80 z-30 flex flex-col items-center p-8 backdrop-blur-sm overflow-y-auto">
          <h1 className="text-4xl text-white font-bold mt-10 mb-8">
            SELECT SAVE
          </h1>
          <div className="flex flex-wrap gap-6 mb-8 justify-center max-w-4xl">
            {saves.map((save) => (
              <div
                key={save.id}
                className="p-6 bg-gray-900 border border-gray-700 rounded-lg flex flex-col items-center min-w-[250px] shadow-lg"
              >
                <div className="w-16 h-16 mb-2 relative bg-slate-900 border-2 border-slate-700 rounded-lg flex items-center justify-center p-1">
                  {/* Legacy Knight Helmet & Plume Preview */}
                  <div className="relative w-8 h-10 flex flex-col items-center">
                    {/* Plume */}
                    <div className="w-2 h-2 rounded-t-sm mb-[1px]" style={{ backgroundColor: save.color }}></div>
                    {/* Helm */}
                    <div className="w-7 h-7 bg-slate-300 rounded-t-md relative border border-slate-500 shadow-inner">
                      {/* T-Visor */}
                      <div className="absolute top-2 inset-x-1 h-1.5 bg-slate-950 flex items-center justify-center">
                        <div className="w-2 h-[2px] bg-cyan-400"></div>
                      </div>
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-1.5 h-3 bg-slate-950"></div>
                    </div>
                  </div>
                </div>
                <h2 className="text-xl font-bold mb-1">{save.name}</h2>
                <p className="text-sm text-cyan-400 mb-3">
                  Max Floor: {save.maxFloorReached}
                </p>

                {/* Character Color Customization Swatches */}
                <p className="text-xs text-gray-400 mb-1">Knight Cape & Plume Color:</p>
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
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${save.color === color ? "border-white scale-125 z-10 shadow-md" : "border-transparent opacity-80 hover:opacity-100"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                <button
                  onClick={() => startGame(save)}
                  className="px-4 py-2 bg-cyan-600 text-white font-bold hover:bg-cyan-500 w-full rounded"
                >
                  ENTER CAVE
                </button>
              </div>
            ))}
          </div>

          <div className="flex space-x-4">
            <button
              onClick={createNewSave}
              className="px-6 py-3 bg-white/10 text-white font-bold border border-white/20 hover:bg-white/20 rounded"
            >
              CREATE NEW KNIGHT
            </button>
            <button
              onClick={() => setAppState("menu")}
              className="px-6 py-3 text-gray-400 hover:text-white rounded border border-transparent hover:border-white/20"
            >
              BACK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
