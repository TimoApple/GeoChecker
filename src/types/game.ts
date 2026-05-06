// GeoCheckr — Game Types
import { Location } from './location';

export interface Player {
  id: number;
  name: string;
  score: number;
  cards: Location[];
  chips: Chip[];
}

export interface Chip {
  type: 'help' | 'hint' | 'challenge';
  used: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentLocation: Location | null;
  phase: GamePhase;
  timer: number;
  round: number;
  targetScore: number;
  difficulty: Difficulty;
  history: RoundHistory[];
}

export type GamePhase = 
  | 'setup' 
  | 'scan' 
  | 'view' 
  | 'answer' 
  | 'result' 
  | 'finished';

export type Difficulty = 'leicht' | 'mittel' | 'schwer';

export interface RoundHistory {
  round: number;
  playerId: number;
  locationId: number;
  guessedCity: string;
  actualCity: string;
  distance: number;
  points: number;
}

export interface GameSettings {
  playerCount: number;
  targetScore: number;
  difficulty: Difficulty;
  timerSeconds: number;
  bonusChips: boolean;
}
