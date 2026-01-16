import React, { useState, useEffect, useMemo } from 'react';
import { GameRound, GameStatus, TreeData, Difficulty } from './types';
import { fetchNewTrees, generateTreeImage, fetchNewFunFact } from './services/geminiService';
import Globe from './components/Globe';

const Pollen: React.FC<{ left: string; delay: string; duration: string; size: string }> = ({ left, delay, duration, size }) => (
  <div 
    className="pollen" 
    style={{ 
      left, 
      animationDelay: delay, 
      animationDuration: duration,
      width: size,
      height: size
    }} 
  />
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

  const pollenElements = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      duration: `${Math.random() * 5 + 5}s`,
      size: `${Math.random() * 3 + 2}px`
    }));
  }, []);

  const initGame = async (selectedDifficulty: Difficulty) => {
    try {
      setDifficulty(selectedDifficulty);
      setStatus(GameStatus.LOADING);
      setLoadingStep(`Stepping onto the ${selectedDifficulty.toLowerCase()} trail...`);
      const trees = await fetchNewTrees(selectedDifficulty);
      setPool(trees);
      await startRound(trees[0], trees);
    } catch (error) {
      console.error(error);
      setStatus(GameStatus.ERROR);
    }
  };

  const startRound = async (target: TreeData, currentPool: TreeData[]) => {
    setStatus(GameStatus.LOADING);
    setLoadingStep(`Isolating seasonal markers for the next specimen...`);
    
    try {
      const autumnImg = await generateTreeImage(target.autumnDescription, 'autumn');
      const distractors = currentPool
        .filter(t => t.id !== target.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 2)
        .map(t => t.commonName);
      
      const options = [target.commonName, ...distractors].sort(() => 0.5 - Math.random());

      setCurrentRound({
        targetTree: target,
        options,
        autumnImageUrl: autumnImg,
        springImageUrl: null
      });
      
      setSelectedOption(null);
      setIsCorrect(null);
      setStatus(GameStatus.GUESSING);
    } catch (error) {
      console.error(error);
      setStatus(GameStatus.ERROR);
    }
  };

  const handleGuess = async (choice: string) => {
    if (!currentRound) return;
    
    setSelectedOption(choice);
    const correct = choice === currentRound.targetTree.commonName;
    setIsCorrect(correct);
    
    if (correct) {
      setScore(prev => prev + 1);
      setStatus(GameStatus.LOADING);
      setLoadingStep('Waiting for the first light of spring...');
      
      try {
        const springImg = await generateTreeImage(currentRound.targetTree.springDescription, 'spring');
        setCurrentRound(prev => prev ? { ...prev, springImageUrl: springImg } : null);
        setStatus(GameStatus.RESULT);
      } catch (error) {
        console.error(error);
        setStatus(GameStatus.RESULT); 
      }
    } else {
      setStatus(GameStatus.RESULT);
    }
  };

  const handleRegenerateFact = async () => {
    if (!currentRound || isFactLoading) return;
    setIsFactLoading(true);
    try {
      const newFact = await fetchNewFunFact(currentRound.targetTree.commonName, currentRound.targetTree.scientificName);
      setCurrentRound(prev => {
        if (!prev) return null;
        return {
          ...prev,
          targetTree: {
            ...prev.targetTree,
            funFact: newFact
          }
        };
      });
    } catch (error) {
      console.error("Failed to regenerate fact", error);
    } finally {
      setIsFactLoading(false);
    }
  };

  const nextRound = () => {
    const nextIdx = pool.findIndex(t => t.id === currentRound?.targetTree.id) + 1;
    if (nextIdx < pool.length) {
      startRound(pool[nextIdx], pool);
    } else if (difficulty) {
      initGame(difficulty);
    }
  };

  if (status === GameStatus.DIFFICULTY_SELECTION) {
    return (
      <div className="relative min-h-screen flex flex-col items-center py-12 md:py-24 px-6 md:px-8 overflow-hidden">
        <div className="forest-core"></div>
        <div className="mist"></div>
        <div className="sun-ray"></div>
        
        {pollenElements.map(p => <Pollen key={p.id} {...p} />)}
        
        <i className="fas fa-leaf bokeh-leaf text-7xl md:text-9xl -top-5 -left-5 md:-top-10 md:-left-10 rotate-45"></i>
        <i className="fas fa-leaf bokeh-leaf text-[8rem] md:text-[12rem] -bottom-10 -right-10 md:-bottom-20 md:-right-20 -rotate-12"></i>

        <div className="z-10 text-center max-w-5xl w-full">
          <header className="mb-12 md:mb-20 animate-in fade-in slide-in-from-top-12 duration-1000">
            <h1 className="text-5xl xs:text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter text-[#ff4500] accent-red-glow mb-4 uppercase leading-none break-words">
              ARBOR<span className="text-[#ca8a04] font-serif italic normal-case inline-block">Gaia</span>
            </h1>
            <div className="h-1 w-16 md:w-24 bg-[#ff4500] mx-auto rounded-full mb-6"></div>
            <p className="text-red-100/50 text-base md:text-xl font-light tracking-wide max-w-2xl mx-auto italic px-4">
              "To identify a tree in autumn is to know its history; <br className="hidden sm:block" /> to see it in spring is to witness its future."
            </p>
          </header>

          <div className="relative flex flex-col gap-12 md:gap-32 items-center">
            <div className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#ff4500]/40 to-transparent left-1/2 -translate-x-1/2 hidden md:block"></div>

            {[
              { 
                type: Difficulty.EASY, 
                title: 'The Sunlit Path', 
                desc: 'Iconic giants of the meadows. Perfect for a gentle stroll through known favorites.', 
                icon: 'fa-sun', 
                align: 'md:translate-x-[-60%]' 
              },
              { 
                type: Difficulty.MEDIUM, 
                title: 'The Hidden Grove', 
                desc: 'Rare regional treasures and unique foliage tucked away in deep forest shadows.', 
                icon: 'fa-wind', 
                align: 'md:translate-x-[60%]' 
              },
              { 
                type: Difficulty.HARD, 
                title: 'The Forgotten Peak', 
                desc: 'Ancient, cryptic species from the most remote botanical edges of the world.', 
                icon: 'fa-mountain', 
                align: 'md:translate-x-[-60%]' 
              }
            ].map((path, idx) => (
              <button
                key={path.type}
                onClick={() => initGame(path.type)}
                className={`
                  group relative w-full max-w-md ${path.align} 
                  animate-in fade-in slide-in-from-bottom-8 duration-700
                `}
                style={{ animationDelay: `${idx * 200}ms` }}
              >
                <div className="organic-glass p-8 md:p-10 text-left transition-all duration-500 group-hover:scale-105 group-hover:bg-[#ff4500]/20 group-hover:border-[#ff4500]/40">
                  <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-6">
                    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#ff4500]/10 flex items-center justify-center border border-[#ff4500]/20 group-hover:bg-[#ff4500] transition-all duration-500 flex-shrink-0">
                      <i className={`fas ${path.icon} text-xl md:text-2xl text-[#ca8a04] group-hover:text-[#ca8a04]`}></i>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold font-serif text-[#ca8a04]">{path.title}</h3>
                  </div>
                  <p className="text-sm md:text-base text-slate-400 leading-relaxed mb-6 md:mb-8">{path.desc}</p>
                  <div className="flex items-center gap-4 text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] text-[#ff4500] group-hover:text-[#ff4500] transition-colors">
                    Explore Trail <i className="fas fa-arrow-right-long group-hover:translate-x-4 transition-transform"></i>
                  </div>
                </div>
                
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#ff4500] rounded-full border-4 border-[#0a0f05] hidden md:block z-20 shadow-[0_0_15px_rgba(255,69,0,0.8)]"></div>
              </button>
            ))}
          </div>
        </div>

        <footer className="mt-20 md:mt-32 opacity-30 text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] md:tracking-[0.6em] text-orange-200 text-center">
          Biological Identity Protocol • v2.8.0
        </footer>
      </div>
    );
  }

  if (status === GameStatus.LOADING) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0f05] text-white p-6 relative overflow-hidden">
        <div className="forest-core"></div>
        {pollenElements.slice(0, 10).map(p => <Pollen key={p.id} {...p} />)}
        
        <div className="relative mb-16">
          <div className="w-32 h-32 md:w-40 md:h-40 border-t-2 border-[#ff4500] rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <i className="fas fa-compass text-[#ff4500]/30 text-3xl md:text-4xl animate-pulse"></i>
          </div>
        </div>
        <p className="text-red-100/50 font-serif italic text-xl md:text-2xl animate-pulse text-center max-w-lg px-8 leading-relaxed">
          "{loadingStep}"
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f05] text-white pb-32">
      <div className="forest-core opacity-50"></div>
      
      <header className="sticky top-0 z-50 bg-[#0a0f05]/60 backdrop-blur-3xl border-b border-[#ff4500]/10 p-6 md:p-8 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 md:gap-6 cursor-pointer group flex-1" onClick={() => setStatus(GameStatus.DIFFICULTY_SELECTION)}>
            <div className="w-10 h-10 md:w-14 md:h-14 bg-[#ff4500] rounded-xl md:rounded-[1.5rem] flex items-center justify-center shadow-2xl group-hover:rotate-12 transition-all flex-shrink-0">
              <i className="fas fa-tree text-[#ca8a04] text-base md:text-xl"></i>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-3xl font-black tracking-tighter leading-none uppercase text-[#ff4500] truncate">ARBOR<span className="text-[#ca8a04]">Gaia</span></h1>
              <p className="text-[8px] md:text-[10px] text-[#ff4500]/60 uppercase tracking-[0.3em] md:tracking-[0.5em] font-black mt-1 md:mt-2 truncate">{difficulty} MODE</p>
            </div>
          </div>
          <div className="text-right glass px-4 md:px-8 py-2 md:py-3 rounded-full border-[#ff4500]/10 flex-shrink-0">
            <p className="text-[7px] md:text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mb-0 md:mb-1">Trail Score</p>
            <p className="text-xl md:text-3xl font-black text-[#ca8a04] tabular-nums leading-none">{score}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-12 mt-12 md:mt-20">
        {currentRound && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-20 items-start">
            
            <div className="lg:col-span-7 space-y-8 md:space-y-12">
              <div className="relative group rounded-[2.5rem] md:rounded-[4rem] overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] border border-[#ff4500]/10 bg-[#0a0f05] transition-all duration-1000">
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f05] via-transparent to-transparent z-10"></div>
                
                <img 
                  src={isCorrect ? (currentRound.springImageUrl || currentRound.autumnImageUrl) : currentRound.autumnImageUrl} 
                  alt="Botanical Specimen"
                  className={`w-full aspect-[4/5] object-cover transition-all duration-[3000ms] scale-100 group-hover:scale-110 ${isCorrect ? 'correct-glow' : ''}`}
                />

                <div className="absolute top-6 right-6 md:top-12 md:right-12 z-20 px-4 md:px-8 py-2 md:py-4 bg-black/40 backdrop-blur-3xl rounded-full border border-[#ff4500]/20 flex items-center gap-2 md:gap-4">
                  <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${isCorrect ? 'bg-[#ca8a04] animate-ping' : 'bg-[#ff4500] shadow-[0_0_15px_#ff4500]'}`}></div>
                  <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-[#ca8a04]">
                    {isCorrect ? 'Vernal Phase' : 'Autumnal Phase'}
                  </span>
                </div>

                {isCorrect && (
                  <div className="absolute inset-x-0 bottom-0 z-20 p-8 md:p-16 animate-in slide-in-from-bottom-12 duration-1000">
                    <h2 className="text-4xl md:text-7xl font-bold text-[#ca8a04] mb-2 md:mb-3 font-serif leading-tight">{currentRound.targetTree.commonName}</h2>
                    <p className="text-[#ca8a04] italic text-lg md:text-2xl font-light opacity-80">{currentRound.targetTree.scientificName}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 space-y-12 md:space-y-16">
              {status === GameStatus.GUESSING && (
                <div className="organic-glass p-8 md:p-16 animate-in fade-in slide-in-from-right-16 duration-700">
                  <h3 className="text-xl md:text-2xl font-bold text-[#ca8a04] mb-8 md:mb-12 flex items-center gap-4 md:gap-5">
                    <div className="w-1 md:w-1.5 h-8 md:h-10 bg-[#ff4500] rounded-full"></div>
                    Identification Log
                  </h3>
                  
                  <div className="space-y-4 md:space-y-6">
                    {currentRound.options.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleGuess(option)}
                        disabled={selectedOption !== null}
                        className={`
                          w-full p-6 md:p-10 rounded-3xl md:rounded-[2.5rem] text-left font-bold transition-all duration-500 border-2 btn-organic
                          ${selectedOption === option 
                            ? (option === currentRound.targetTree.commonName ? 'bg-[#ff4500] text-[#ca8a04] border-[#ca8a04]' : 'bg-[#ff4500]/20 border-[#ff4500] text-[#ff4500]')
                            : 'bg-[#ff4500] text-[#ca8a04] border-[#ff4500]/30 hover:bg-[#ff4500]/80'
                          }
                          flex items-center justify-between group
                        `}
                      >
                        <span className="text-lg md:text-xl tracking-tight">{option}</span>
                        <i className={`fas ${selectedOption === option ? (option === currentRound.targetTree.commonName ? 'fa-check' : 'fa-times') : 'fa-leaf opacity-0 group-hover:opacity-40 transition-all transform rotate-45 text-[#ca8a04]'}`}></i>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {status === GameStatus.RESULT && (
                <div className="space-y-12 md:space-y-16 animate-in fade-in slide-in-from-right-16 duration-1000">
                  {isCorrect ? (
                    <>
                      <div className="organic-glass p-8 md:p-12 text-center border-[#ff4500]/20">
                        <h2 className="text-3xl md:text-4xl font-black text-[#ca8a04] mb-3 md:mb-4 font-serif">Deep Observation</h2>
                        <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-sm mx-auto">Your perception of the forest cycles has advanced on this trail.</p>
                      </div>
                      
                      <div className="rounded-3xl md:rounded-[4rem] overflow-hidden glass shadow-3xl border border-[#ff4500]/10">
                        <Globe locations={currentRound.targetTree.habitats} />
                      </div>

                      <div className="relative p-8 md:p-12 bg-white/5 border border-[#ff4500]/10 rounded-3xl md:rounded-[3rem] group">
                        <i className="fas fa-seedling text-4xl md:text-5xl text-[#ff4500]/10 absolute -top-3 -left-3 md:-top-4 md:-left-4"></i>
                        <div className="flex justify-between items-center mb-4 md:mb-6">
                          <h4 className="font-black text-[#ff4500]/40 uppercase tracking-[0.4em] md:tracking-[0.5em] text-[8px] md:text-[10px]">Naturalist's Monograph</h4>
                          <button 
                            onClick={handleRegenerateFact}
                            disabled={isFactLoading}
                            className={`
                              flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff4500]/20 border border-[#ff4500]/30 text-[8px] md:text-[9px] uppercase tracking-widest font-black text-[#ca8a04] hover:bg-[#ff4500]/40 transition-all
                              ${isFactLoading ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <i className={`fas fa-sync ${isFactLoading ? 'animate-spin' : ''}`}></i>
                            {isFactLoading ? 'Consulting Records...' : 'New Fact'}
                          </button>
                        </div>
                        <p className={`text-xl md:text-2xl text-[#ca8a04] leading-relaxed font-serif italic relative z-10 transition-opacity duration-500 ${isFactLoading ? 'opacity-30' : 'opacity-100'}`}>
                          "{currentRound.targetTree.funFact}"
                        </p>
                      </div>

                      <button 
                        onClick={nextRound}
                        className="w-full py-6 md:py-8 bg-[#ff4500] hover:bg-[#ff5d22] text-[#ca8a04] rounded-[2rem] md:rounded-[2.5rem] font-black shadow-[0_20px_50px_rgba(255,69,0,0.4)] transition-all transform hover:-translate-y-2 active:scale-95 flex items-center justify-center gap-4 md:gap-6 text-lg md:text-xl"
                      >
                        Continue the Trail <i className="fas fa-person-hiking animate-bounce"></i>
                      </button>
                    </>
                  ) : (
                    <div className="organic-glass p-8 md:p-16 text-center border-[#ff4500]/20">
                      <div className="w-20 h-20 md:w-28 md:h-28 bg-[#ff4500]/10 rounded-full flex items-center justify-center mx-auto mb-8 md:mb-10 border border-[#ff4500]/20">
                        <i className="fas fa-cloud-sun text-[#ff4500] text-3xl md:text-4xl"></i>
                      </div>
                      <h2 className="text-3xl md:text-4xl font-black text-[#ff4500] mb-4 md:mb-6 tracking-tight font-serif">Trail Distraction</h2>
                      <p className="text-slate-400 mb-8 md:mb-12 leading-relaxed text-lg md:text-xl font-light">The subtle details were obscured. This specimen was a <span className="text-[#ca8a04] font-bold">{currentRound.targetTree.commonName}</span>.</p>
                      <button 
                        onClick={nextRound}
                        className="w-full py-6 md:py-8 bg-[#ff4500] hover:bg-[#ff5d22] text-[#ca8a04] rounded-[2rem] md:rounded-[2.5rem] font-black transition-all flex items-center justify-center gap-4 md:gap-6 border border-[#ff4500]/20 text-lg md:text-xl"
                      >
                        New Specimen <i className="fas fa-rotate-right"></i>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-40 md:mt-60 text-center pb-20 md:pb-32 px-6">
        <div className="w-24 md:w-32 h-px bg-gradient-to-r from-transparent via-[#ff4500]/20 to-transparent mx-auto mb-12 md:mb-16"></div>
        <p className="text-[9px] md:text-[11px] uppercase tracking-[0.6em] md:tracking-[0.8em] text-[#ff4500]/60 font-black mb-8 md:mb-10">ArborGaia Synthesis Engine</p>
        <button 
          onClick={() => setStatus(GameStatus.DIFFICULTY_SELECTION)}
          className="px-8 md:px-14 py-4 md:py-5 text-[9px] md:text-[11px] text-[#ca8a04] hover:text-[#eab308] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] transition-all flex items-center gap-3 md:gap-4 mx-auto bg-[#ff4500] rounded-full border border-[#ff4500]/20 hover:border-[#ff4500]/40 backdrop-blur-xl"
        >
          <i className="fas fa-compass"></i> Return to Trailhead
        </button>
      </footer>
    </div>
  );
};

export default App;