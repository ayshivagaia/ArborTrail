import React, { useState, useEffect, useMemo, useRef } from 'https://esm.sh/react@19.0.0';
import { createRoot } from 'https://esm.sh/react-dom@19.0.0/client';
import { GoogleGenAI, Type } from 'https://esm.sh/@google/genai@1.36.0';
import * as d3 from 'https://esm.sh/d3@7.9.0';
import * as topojson from 'https://esm.sh/topojson-client@3.1.0';

// --- TYPES ---
export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface TreeData {
  id: string;
  commonName: string;
  scientificName: string;
  autumnDescription: string;
  springDescription: string;
  habitats: GeoLocation[];
  funFact: string;
}

export interface GameRound {
  targetTree: TreeData;
  options: string[];
  autumnImageUrl: string;
  springImageUrl: string | null;
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard'
}

export enum GameStatus {
  DIFFICULTY_SELECTION = 'DIFFICULTY_SELECTION',
  LOADING = 'LOADING',
  GUESSING = 'GUESSING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}

// --- SERVICES ---
const getAI = () => {
  const key = (window as any).process?.env?.API_KEY;
  if (!key || key === 'API_KEY_PLACEHOLDER') {
    console.error("ArborGaia: API Key is still the placeholder. Check Netlify Environment Variables.");
    return null;
  }
  console.log("ArborGaia: API Key detected. Initializing engine...");
  return new GoogleGenAI({ apiKey: key });
};

const getTreeListPrompt = (difficulty: Difficulty) => {
  let criteria = "";
  if (difficulty === Difficulty.EASY) criteria = "very common, iconic trees with distinct shapes and vibrant autumn colors (e.g., Sugar Maple, Weeping Willow).";
  else if (difficulty === Difficulty.MEDIUM) criteria = "a mix of regional trees and unique species with specific growth patterns (e.g., Ginkgo Biloba, Scarlet Oak).";
  else criteria = "rare, ancient, or cryptic species from specific global habitats (e.g., Wollemi Pine, Baobab).";

  return `Generate 3 distinct tree species matching: ${criteria}. Provide commonName, scientificName, autumnDescription, springDescription, funFact, and habitats (5-8 major lat/lng coords). Return JSON array.`;
};

async function fetchNewTrees(difficulty: Difficulty): Promise<TreeData[]> {
  const ai = getAI();
  if (!ai) throw new Error("API Key Missing");
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: getTreeListPrompt(difficulty),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            commonName: { type: Type.STRING },
            scientificName: { type: Type.STRING },
            autumnDescription: { type: Type.STRING },
            springDescription: { type: Type.STRING },
            funFact: { type: Type.STRING },
            habitats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { lat: { type: Type.NUMBER }, lng: { type: Type.NUMBER } },
                required: ["lat", "lng"]
              }
            }
          },
          required: ["commonName", "scientificName", "autumnDescription", "springDescription", "funFact", "habitats"]
        }
      }
    }
  });
  const data = JSON.parse(response.text);
  return data.map((t: any, index: number) => ({ ...t, id: `tree-${Date.now()}-${index}` }));
}

async function generateTreeImage(description: string, season: 'autumn' | 'spring'): Promise<string> {
  const ai = getAI();
  if (!ai) throw new Error("API Key Missing");

  const prompt = `Hyper-realistic wide-angle nature photo of a single ${description}. Cinematic lighting, ${season} morning atmosphere. 8k, National Geographic style. No text.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "16:9" } }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  throw new Error("Botanical imaging failed.");
}

// --- COMPONENTS ---
const Globe: React.FC<{ locations: GeoLocation[] }> = ({ locations }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landData, setLandData] = useState<any>(null);

  useEffect(() => {
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then((data: any) => {
      if (data) setLandData(topojson.feature(data, data.objects.land));
    });
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !landData) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.width;
    const height = canvas.height;
    const projection = d3.geoOrthographic().scale(width / 2.2).translate([width / 2, height / 2]).clipAngle(90);
    const path = d3.geoPath(projection, context);
    let rotation = 0;
    let animationFrameId: number;

    const render = () => {
      context.clearRect(0, 0, width, height);
      rotation += 0.35;
      projection.rotate([rotation, -10]);
      
      context.fillStyle = '#050802';
      context.beginPath(); context.arc(width/2, height/2, width/2.2, 0, 2 * Math.PI); context.fill();
      
      context.fillStyle = '#1e290e'; context.strokeStyle = '#3a4a24'; context.lineWidth = 0.5;
      context.beginPath(); path(landData); context.fill(); context.stroke();
      
      locations.forEach(loc => {
        const coords = projection([loc.lng, loc.lat]);
        if (coords) {
          const dist = d3.geoDistance([loc.lng, loc.lat], [-projection.rotate()[0], -projection.rotate()[1]]);
          if (dist < Math.PI / 2) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            context.fillStyle = '#ff4500'; 
            context.beginPath(); context.arc(coords[0], coords[1], 3 + pulse * 2, 0, 2 * Math.PI); context.fill();
            context.strokeStyle = `rgba(255, 69, 0, ${0.4 * (1-pulse)})`;
            context.lineWidth = 1;
            context.beginPath(); context.arc(coords[0], coords[1], 6 + pulse * 10, 0, 2 * Math.PI); context.stroke();
          }
        }
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [landData, locations]);

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <canvas ref={canvasRef} width={260} height={260} className="rounded-full shadow-[0_0_50px_rgba(255,69,0,0.1)] border border-white/5" />
      <div className="mt-4 flex items-center gap-2 opacity-40">
        <i className="fas fa-satellite text-[10px]"></i>
        <span className="text-[9px] uppercase tracking-[0.3em] font-black">Habitat Distribution</span>
      </div>
    </div>
  );
};

const Pollen: React.FC<{ left: string; delay: string; duration: string; size: string }> = ({ left, delay, duration, size }) => (
  <div className="pollen" style={{ left, animationDelay: delay, animationDuration: duration, width: size, height: size }} />
);

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.DIFFICULTY_SELECTION);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [currentRound, setCurrentRound] = useState<GameRound | null>(null);
  const [pool, setPool] = useState<TreeData[]>([]);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('');

  const pollenElements = useMemo(() => Array.from({ length: 30 }).map((_, i) => ({
    id: i, left: `${Math.random() * 100}%`, delay: `${Math.random() * 10}s`, duration: `${Math.random() * 7 + 3}s`, size: `${Math.random() * 2 + 2}px`
  })), []);

  useEffect(() => {
    const ai = getAI();
    if (!ai) setStatus(GameStatus.ERROR);
  }, []);

  const initGame = async (selectedDifficulty: Difficulty) => {
    try {
      setDifficulty(selectedDifficulty);
      setStatus(GameStatus.LOADING);
      setLoadingStep(`Exploring the ${selectedDifficulty.toLowerCase()} trail...`);
      const trees = await fetchNewTrees(selectedDifficulty);
      setPool(trees);
      await startRound(trees[0], trees);
    } catch (e) { 
      console.error("ArborGaia: Error initializing game", e);
      setStatus(GameStatus.ERROR); 
    }
  };

  const startRound = async (target: TreeData, currentPool: TreeData[]) => {
    setStatus(GameStatus.LOADING);
    setLoadingStep(`Processing seasonal markers...`);
    try {
      const autumnImg = await generateTreeImage(target.autumnDescription, 'autumn');
      const distractors = currentPool.filter(t => t.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 2).map(t => t.commonName);
      const options = [target.commonName, ...distractors].sort(() => 0.5 - Math.random());
      setCurrentRound({ targetTree: target, options, autumnImageUrl: autumnImg, springImageUrl: null });
      setSelectedOption(null); setIsCorrect(null); setStatus(GameStatus.GUESSING);
    } catch (e) { 
      console.error("ArborGaia: Error starting round", e);
      setStatus(GameStatus.ERROR); 
    }
  };

  const handleGuess = async (choice: string) => {
    if (!currentRound) return;
    setSelectedOption(choice);
    const correct = choice === currentRound.targetTree.commonName;
    setIsCorrect(correct);
    if (correct) {
      setScore(s => s + 1);
      setStatus(GameStatus.LOADING);
      setLoadingStep('Simulating spring transition...');
      try {
        const springImg = await generateTreeImage(currentRound.targetTree.springDescription, 'spring');
        setCurrentRound(prev => prev ? { ...prev, springImageUrl: springImg } : null);
        setStatus(GameStatus.RESULT);
      } catch (e) { 
        console.warn("ArborGaia: Spring image failed to generate", e);
        setStatus(GameStatus.RESULT); 
      }
    } else { setStatus(GameStatus.RESULT); }
  };

  const nextRound = () => {
    const nextIdx = pool.findIndex(t => t.id === currentRound?.targetTree.id) + 1;
    if (nextIdx < pool.length) startRound(pool[nextIdx], pool);
    else if (difficulty) initGame(difficulty);
  };

  if (status === GameStatus.ERROR) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#080c04] text-white p-12 text-center">
        <div className="forest-core"></div>
        <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center mb-8 border border-red-500/30">
          <i className="fas fa-plug text-3xl text-red-500"></i>
        </div>
        <h2 className="text-4xl font-black mb-4 uppercase tracking-tighter">Connection Failed</h2>
        <div className="text-slate-400 max-w-sm text-sm leading-relaxed space-y-4">
          <p>The botanical engine could not start. This usually means the API key is missing or invalid.</p>
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-left">
            <p className="font-bold text-[#ca8a04] mb-2 uppercase text-[10px] tracking-widest">Troubleshooting Steps:</p>
            <ol className="list-decimal ml-4 space-y-1 opacity-70">
              <li>Open <strong>Site Configuration</strong> in Netlify.</li>
              <li>Go to <strong>Environment variables</strong>.</li>
              <li>Add <code className="text-[#ff4500]">API_KEY</code> with your key.</li>
              <li>Go to <strong>Deploys</strong> and click <strong>Trigger deploy > Clear cache and deploy site</strong>.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (status === GameStatus.DIFFICULTY_SELECTION) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center py-12 px-6 overflow-hidden">
        <div className="forest-core"></div>
        {pollenElements.map(p => <Pollen key={p.id} {...p} />)}
        
        <header className="text-center w-full mb-16 animate-in fade-in duration-1000">
          <h1 className="text-[13vw] sm:text-8xl md:text-9xl font-black tracking-tighter text-[#ff4500] accent-red-glow uppercase leading-none break-keep whitespace-nowrap overflow-hidden mb-4">
            ARBOR<span className="text-[#ca8a04] font-serif italic normal-case inline">Gaia</span>
          </h1>
          <p className="text-white/30 italic text-sm md:text-xl font-light tracking-wide">Identify the cycle. Master the forest.</p>
        </header>

        <div className="flex flex-col gap-6 w-full max-w-xs md:max-w-md">
          {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map((d) => (
            <button key={d} onClick={() => initGame(d)} className="organic-glass p-8 text-left hover:scale-105 transition-all hover:bg-[#ff4500]/10 border-[#ff4500]/20 group">
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-bold font-serif text-[#ca8a04]">{d} Trail</h3>
                <i className="fas fa-leaf opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"></i>
              </div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-2 font-black">Level Identification Protocol</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (status === GameStatus.LOADING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#080c04] text-white p-6">
        <div className="w-16 h-16 border-t-2 border-[#ff4500] rounded-full animate-spin mb-8 shadow-[0_0_30px_rgba(255,69,0,0.2)]"></div>
        <p className="text-lg italic font-serif opacity-40 text-center animate-pulse">"{loadingStep}"</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c04] text-white selection:bg-[#ff4500] selection:text-white">
      <header className="sticky top-0 z-50 bg-[#080c04]/80 backdrop-blur-3xl border-b border-white/5 p-4 flex justify-between items-center px-6 md:px-12">
        <h1 className="text-2xl font-black tracking-tighter uppercase text-[#ff4500] cursor-pointer" onClick={() => setStatus(GameStatus.DIFFICULTY_SELECTION)}>ARBOR<span className="text-[#ca8a04]">Gaia</span></h1>
        <div className="bg-white/5 px-6 py-1.5 rounded-full border border-white/10 flex items-center gap-4">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Score</span>
          <span className="text-xl font-black text-[#ca8a04] tabular-nums">{score}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start pb-24">
        {currentRound && (
          <>
            <div className="lg:col-span-7">
              <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border border-white/5 group">
                <img src={isCorrect ? (currentRound.springImageUrl || currentRound.autumnImageUrl) : currentRound.autumnImageUrl} className="w-full aspect-[4/5] object-cover transition-transform duration-[5000ms] group-hover:scale-105" alt="Specimen" />
                <div className="absolute top-8 right-8 bg-black/50 backdrop-blur-xl px-5 py-2.5 rounded-full border border-white/10 flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${isCorrect ? 'bg-[#ca8a04] animate-pulse' : 'bg-[#ff4500] shadow-[0_0_10px_#ff4500]'}`}></div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-[#ca8a04]">
                    {isCorrect ? 'Spring Monograph' : 'Autumn Phase'}
                  </span>
                </div>
                {isCorrect && (
                  <div className="absolute inset-x-0 bottom-0 p-12 bg-gradient-to-t from-black via-black/40 to-transparent animate-in slide-in-from-bottom-8 duration-700">
                    <h2 className="text-5xl font-serif text-[#ca8a04] mb-2">{currentRound.targetTree.commonName}</h2>
                    <p className="text-white/50 italic text-xl font-light">{currentRound.targetTree.scientificName}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-10">
              {status === GameStatus.GUESSING && (
                <div className="organic-glass p-10 space-y-6">
                  <h3 className="text-xl font-bold text-[#ca8a04] mb-4 flex items-center gap-4">
                    <div className="w-1.5 h-8 bg-[#ff4500] rounded-full"></div>
                    Identify Specimen
                  </h3>
                  {currentRound.options.map(o => (
                    <button key={o} onClick={() => handleGuess(o)} className="w-full p-7 rounded-[2rem] bg-white/5 border border-white/10 text-left hover:bg-[#ff4500] hover:text-[#080c04] transition-all font-black text-lg group">
                      <div className="flex justify-between items-center">
                        {o}
                        <i className="fas fa-leaf opacity-0 group-hover:opacity-40 transition-opacity rotate-45"></i>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {status === GameStatus.RESULT && (
                <div className="space-y-10 animate-in fade-in slide-in-from-right-12 duration-1000">
                  {isCorrect ? (
                    <>
                      <div className="rounded-[3rem] overflow-hidden glass border border-white/5 bg-black/20">
                        <Globe locations={currentRound.targetTree.habitats} />
                      </div>
                      <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] relative">
                        <i className="fas fa-quote-left absolute top-6 left-6 text-white/5 text-4xl"></i>
                        <p className="text-xl text-[#ca8a04] font-serif italic leading-relaxed relative z-10">"{currentRound.targetTree.funFact}"</p>
                      </div>
                      <button onClick={nextRound} className="w-full py-7 bg-[#ff4500] text-[#080c04] font-black rounded-[2rem] shadow-[0_20px_40px_-10px_rgba(255,69,0,0.3)] hover:scale-[1.02] active:scale-95 transition-all text-xl">Next Trail Point</button>
                    </>
                  ) : (
                    <div className="organic-glass p-12 text-center">
                      <div className="w-20 h-20 bg-[#ff4500]/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-[#ff4500]/20">
                        <i className="fas fa-eye-slash text-[#ff4500] text-3xl"></i>
                      </div>
                      <h2 className="text-3xl font-black text-[#ff4500] mb-4 font-serif italic">Observation Failure</h2>
                      <p className="text-slate-400 mb-10 text-lg">The specimen was a <span className="text-[#ca8a04] font-bold">{currentRound.targetTree.commonName}</span>.</p>
                      <button onClick={nextRound} className="w-full py-7 bg-[#ff4500] text-[#080c04] font-black rounded-[2rem] transition-all text-xl">Retry Scan</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);