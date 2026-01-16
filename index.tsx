import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { GoogleGenAI, Type } from "@google/genai";
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

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
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const getTreeListPrompt = (difficulty: Difficulty) => {
  let criteria = "";
  if (difficulty === Difficulty.EASY) criteria = "very common, iconic trees with distinct shapes and vibrant, classic autumn colors (e.g., Sugar Maple, English Oak).";
  else if (difficulty === Difficulty.MEDIUM) criteria = "a mix of regional trees and unique ornamental species (e.g., Ginkgo Biloba, Japanese Zelkova).";
  else criteria = "rare, endemic, or harder-to-identify species (e.g., Wollemi Pine, Monkey Puzzle Tree).";

  return `Generate 3 distinct tree species matching: ${criteria}. Provide commonName, scientificName, autumnDescription, springDescription, funFact, and habitats (5-8 lat/lng coords). Return JSON array.`;
};

async function fetchNewTrees(difficulty: Difficulty): Promise<TreeData[]> {
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
  const prompt = `A professional, ultra-realistic nature photograph of a single ${description}. The lighting should be cinematic, showcasing ${season} foliage textures. No text. 8k resolution.`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
    config: { imageConfig: { aspectRatio: "16:9" } }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  throw new Error("No image data");
}

async function fetchNewFunFact(commonName: string, scientificName: string): Promise<string> {
  const prompt = `Generate a single fascinating fun fact (max 2 sentences) about ${commonName} (${scientificName}). Return only the fact text.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  return response.text.trim();
}

// --- COMPONENTS ---
const Globe: React.FC<{ locations: GeoLocation[] }> = ({ locations }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landData, setLandData] = useState<any>(null);

  useEffect(() => {
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then((data: any) => {
      setLandData(topojson.feature(data, data.objects.land));
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
      rotation += 0.25;
      projection.rotate([rotation, -15]);
      context.fillStyle = '#020617';
      context.beginPath(); context.arc(width/2, height/2, width/2.2, 0, 2*Math.PI); context.fill();
      context.fillStyle = '#3a5a40'; context.strokeStyle = '#588157'; context.lineWidth = 0.5;
      context.beginPath(); path(landData); context.fill(); context.stroke();
      locations.forEach(loc => {
        const coords = projection([loc.lng, loc.lat]);
        if (coords) {
          const distance = d3.geoDistance([loc.lng, loc.lat], [-projection.rotate()[0], -projection.rotate()[1]]);
          if (distance < Math.PI / 2) {
            context.fillStyle = '#a3b18a'; context.beginPath(); context.arc(coords[0], coords[1], 4, 0, 2*Math.PI); context.fill();
          }
        }
      });
      animationFrameId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [landData, locations]);

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <canvas ref={canvasRef} width={280} height={280} className="rounded-full shadow-2xl" />
      <div className="mt-4 text-[10px] uppercase tracking-widest text-white/40">Global Distribution</div>
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
  const [isFactLoading, setIsFactLoading] = useState(false);

  const pollenElements = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i, left: `${Math.random() * 100}%`, delay: `${Math.random() * 10}s`, duration: `${Math.random() * 5 + 5}s`, size: `${Math.random() * 3 + 2}px`
  })), []);

  const initGame = async (selectedDifficulty: Difficulty) => {
    try {
      setDifficulty(selectedDifficulty);
      setStatus(GameStatus.LOADING);
      setLoadingStep(`Entering ${selectedDifficulty.toLowerCase()} trail...`);
      const trees = await fetchNewTrees(selectedDifficulty);
      setPool(trees);
      await startRound(trees[0], trees);
    } catch (e) { setStatus(GameStatus.ERROR); }
  };

  const startRound = async (target: TreeData, currentPool: TreeData[]) => {
    setStatus(GameStatus.LOADING);
    setLoadingStep(`Analyzing foliage patterns...`);
    try {
      const autumnImg = await generateTreeImage(target.autumnDescription, 'autumn');
      const distractors = currentPool.filter(t => t.id !== target.id).sort(() => 0.5 - Math.random()).slice(0, 2).map(t => t.commonName);
      const options = [target.commonName, ...distractors].sort(() => 0.5 - Math.random());
      setCurrentRound({ targetTree: target, options, autumnImageUrl: autumnImg, springImageUrl: null });
      setSelectedOption(null); setIsCorrect(null); setStatus(GameStatus.GUESSING);
    } catch (e) { setStatus(GameStatus.ERROR); }
  };

  const handleGuess = async (choice: string) => {
    if (!currentRound) return;
    setSelectedOption(choice);
    const correct = choice === currentRound.targetTree.commonName;
    setIsCorrect(correct);
    if (correct) {
      setScore(s => s + 1);
      setStatus(GameStatus.LOADING);
      setLoadingStep('Waiting for spring thaw...');
      try {
        const springImg = await generateTreeImage(currentRound.targetTree.springDescription, 'spring');
        setCurrentRound(prev => prev ? { ...prev, springImageUrl: springImg } : null);
        setStatus(GameStatus.RESULT);
      } catch (e) { setStatus(GameStatus.RESULT); }
    } else { setStatus(GameStatus.RESULT); }
  };

  const nextRound = () => {
    const nextIdx = pool.findIndex(t => t.id === currentRound?.targetTree.id) + 1;
    if (nextIdx < pool.length) startRound(pool[nextIdx], pool);
    else if (difficulty) initGame(difficulty);
  };

  if (status === GameStatus.DIFFICULTY_SELECTION) {
    return (
      <div className="relative min-h-screen flex flex-col items-center py-24 px-8">
        <div className="forest-core"></div>
        {pollenElements.map(p => <Pollen key={p.id} {...p} />)}
        <h1 className="text-8xl font-black text-[#ff4500] mb-8 tracking-tighter uppercase">ARBOR<span className="text-[#ca8a04] font-serif italic normal-case">Gaia</span></h1>
        <div className="flex flex-col gap-8 w-full max-w-lg">
          {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map((d) => (
            <button key={d} onClick={() => initGame(d)} className="organic-glass p-8 text-left hover:scale-105 transition-all hover:bg-[#ff4500]/10 border-[#ff4500]/20">
              <h3 className="text-2xl font-bold text-[#ca8a04]">{d} Trail</h3>
              <p className="text-slate-400 text-sm">Explore species matching this difficulty.</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (status === GameStatus.LOADING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0f05] text-white p-6">
        <div className="w-24 h-24 border-t-2 border-[#ff4500] rounded-full animate-spin mb-8"></div>
        <p className="text-xl italic font-serif opacity-50">"{loadingStep}"</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f05] text-white pb-32">
      <header className="sticky top-0 z-50 bg-[#0a0f05]/80 backdrop-blur-xl border-b border-white/5 p-8 flex justify-between items-center">
        <h1 className="text-3xl font-black text-[#ff4500] cursor-pointer" onClick={() => setStatus(GameStatus.DIFFICULTY_SELECTION)}>ARBOR<span className="text-[#ca8a04]">Gaia</span></h1>
        <div className="bg-white/5 px-6 py-2 rounded-full border border-white/10 font-bold text-[#ca8a04]">Score: {score}</div>
      </header>
      <main className="max-w-6xl mx-auto px-8 mt-16 grid grid-cols-1 lg:grid-cols-12 gap-16">
        {currentRound && (
          <>
            <div className="lg:col-span-7">
              <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border border-white/5">
                <img src={isCorrect ? (currentRound.springImageUrl || currentRound.autumnImageUrl) : currentRound.autumnImageUrl} className="w-full aspect-square object-cover" alt="Tree" />
                <div className="absolute top-8 right-8 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-[#ca8a04]">
                  {isCorrect ? 'Vernal Phase' : 'Autumnal Phase'}
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 space-y-8">
              {status === GameStatus.GUESSING && (
                <div className="organic-glass p-12 space-y-4">
                  <h2 className="text-xl font-bold text-[#ca8a04] mb-8">Identify this specimen:</h2>
                  {currentRound.options.map(o => (
                    <button key={o} onClick={() => handleGuess(o)} className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-left hover:bg-[#ff4500] hover:text-black transition-all font-bold">
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {status === GameStatus.RESULT && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-8">
                  <div className={`p-12 rounded-[2rem] border ${isCorrect ? 'bg-[#3a5a40]/20 border-[#588157]/30' : 'bg-red-900/20 border-red-500/30'}`}>
                    <h2 className="text-4xl font-serif italic mb-2 text-[#ca8a04]">{currentRound.targetTree.commonName}</h2>
                    <p className="opacity-50 mb-6">{currentRound.targetTree.scientificName}</p>
                    <p className="text-slate-300 italic">"{currentRound.targetTree.funFact}"</p>
                  </div>
                  {isCorrect && <Globe locations={currentRound.targetTree.habitats} />}
                  <button onClick={nextRound} className="w-full py-6 bg-[#ff4500] text-black font-black rounded-2xl shadow-xl hover:scale-105 transition-transform">
                    {isCorrect ? 'Next Specimen' : 'Try Again'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);