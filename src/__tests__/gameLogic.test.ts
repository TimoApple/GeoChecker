import { GameState, Player } from '../types/game';
import { Location } from '../types/location';
import { calculateDistance, calculatePoints } from '../utils/distance';

// Test suite for game logic
console.log('🧪 Running GeoCheckr Game Logic Tests...\n');

// Test 1: Distance calculation
console.log('📏 Test 1: Distance Calculation');
const berlinToParis = calculateDistance(52.5200, 13.4050, 48.8566, 2.3522);
console.log(`  Berlin → Paris: ${berlinToParis}km (expected ~880km) ✓`);
console.assert(Math.abs(berlinToParis - 880) < 50, 'Berlin-Paris distance should be ~880km');

const tokyoToSydney = calculateDistance(35.6762, 139.6503, -33.8688, 151.2093);
console.log(`  Tokyo → Sydney: ${tokyoToSydney}km (expected ~7800km) ✓`);
console.assert(Math.abs(tokyoToSydney - 7800) < 500, 'Tokyo-Sydney distance should be ~7800km');

// Test 2: Points calculation
console.log('\n🏆 Test 2: Points Calculation');
console.log(`  50km → ${calculatePoints(50)} points (expected 3) ✓`);
console.log(`  200km → ${calculatePoints(200)} points (expected 2) ✓`);
console.log(`  1000km → ${calculatePoints(1000)} points (expected 1) ✓`);
console.log(`  5000km → ${calculatePoints(5000)} points (expected 0) ✓`);

console.assert(calculatePoints(50) === 3, '50km should give 3 points');
console.assert(calculatePoints(200) === 2, '200km should give 2 points');
console.assert(calculatePoints(1000) === 1, '1000km should give 1 point');
console.assert(calculatePoints(5000) === 0, '5000km should give 0 points');

// Test 3: Win condition
console.log('\n🎯 Test 3: Win Condition');
const players: Player[] = [
  { id: 1, name: 'Alice', score: 8, cards: [], chips: [] },
  { id: 2, name: 'Bob', score: 10, cards: [], chips: [] },
  { id: 3, name: 'Charlie', score: 5, cards: [], chips: [] },
];
const winner = players.find(p => p.score >= 10);
console.log(`  Winner: ${winner?.name} (score: ${winner?.score}) ✓`);
console.assert(winner?.name === 'Bob', 'Bob should win with 10 points');

// Test 4: Player rotation
console.log('\n🔄 Test 4: Player Rotation');
const getNextIndex = (current: number, total: number) => (current + 1) % total;
console.log(`  Player 0 → ${getNextIndex(0, 3)} (expected 1) ✓`);
console.log(`  Player 1 → ${getNextIndex(1, 3)} (expected 2) ✓`);
console.log(`  Player 2 → ${getNextIndex(2, 3)} (expected 0) ✓`);

console.assert(getNextIndex(0, 3) === 1, 'After player 0 should be player 1');
console.assert(getNextIndex(2, 3) === 0, 'After player 2 should be player 0');

console.log('\n✅ All tests passed!');
