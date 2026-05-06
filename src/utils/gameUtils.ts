import { Location } from '../types/location';

export interface Player {
  id: number;
  name: string;
  cards: Location[];
  score: number;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentLocation: Location | null;
  phase: 'setup' | 'scan' | 'view' | 'answer' | 'result' | 'finished';
  timer: number;
  round: number;
  targetScore: number;
  difficulty: 'leicht' | 'mittel' | 'schwer';
}

export function createPlayer(id: number, name: string): Player {
  return {
    id,
    name,
    cards: [],
    score: 0
  };
}

export function getRandomLocation(locations: Location[], difficulty: string): Location {
  const difficultyMap: Record<string, string[]> = {
    'leicht': ['leicht'],
    'mittel': ['leicht', 'mittel'],
    'schwer': ['leicht', 'mittel', 'schwer']
  };
  
  const available = locations.filter(loc => 
    difficultyMap[difficulty]?.includes(loc.difficulty) ?? true
  );
  
  return available[Math.floor(Math.random() * available.length)];
}

export function checkWinCondition(players: Player[], targetScore: number): Player | null {
  return players.find(p => p.score >= targetScore) || null;
}

export function getNextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}
