
export interface GeoLocation {
  lat: number;
  lng: number;
  label?: string;
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
  IDLE = 'IDLE',
  DIFFICULTY_SELECTION = 'DIFFICULTY_SELECTION',
  LOADING = 'LOADING',
  GUESSING = 'GUESSING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}
