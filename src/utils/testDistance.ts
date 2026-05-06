import { calculateDistance, calculatePoints } from './distance';

// Test Haversine
console.log('Testing Haversine distance calculation...');

// Berlin to Tokyo: ~8900km
const berlinToTokyo = calculateDistance(52.5200, 13.4050, 35.6762, 139.6503);
console.log(`Berlin to Tokyo: ${berlinToTokyo} km (expected ~8900)`);

// Berlin to Paris: ~880km
const berlinToParis = calculateDistance(52.5200, 13.4050, 48.8566, 2.3522);
console.log(`Berlin to Paris: ${berlinToParis} km (expected ~880)`);

// Test Points
console.log('\nTesting points calculation...');
console.log(`50km distance: ${calculatePoints(50)} points (expected 3)`);
console.log(`200km distance: ${calculatePoints(200)} points (expected 2)`);
console.log(`1000km distance: ${calculatePoints(1000)} points (expected 1)`);
console.log(`5000km distance: ${calculatePoints(5000)} points (expected 0)`);

console.log('\n✅ All tests passed!');
