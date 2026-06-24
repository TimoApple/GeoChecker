// Konvertiert _dict_5x5_1000.json in eine kleine JS-Datei mit den ersten 250 Einträgen
// 250 Einträge decken IDs 0-99 ab (Marker aruco_001 bis aruco_100) + Puffer
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_dict_5x5_1000.json'), 'utf8'));
const codeList = raw.codeList;

// 250 Einträge (IDs 0-99 + Puffer)
const entries = codeList.slice(0, 250);

// Konvertiere [a,b,c,d] zu 32-Bit Hex-Zahl (unsigned)
const toHex = (arr) => {
  const val = ((arr[0] & 0xff) << 24) | ((arr[1] & 0xff) << 16) | ((arr[2] & 0xff) << 8) | (arr[3] & 0xff);
  return '0x' + (val >>> 0).toString(16);
};

const hexEntries = entries.map(toHex);

const output = `// ArUco 5x5 Dictionary (DICT_5X5_1000) – erste 250 Einträge
// Generiert aus _dict_5x5_1000.json
// Format: 5x5 Marker, 1000 IDs, 5-bit Hamming-Distanz
// Deckt IDs 0-249 ab

export const ARUCO_5X5_1000 = {
  nBits: 25,
  tau: 5,
  codeList: [${hexEntries.join(',')}]
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'libs', 'aruco_5x5_100.js'), output, 'utf8');
console.log('Geschrieben: src/libs/aruco_5x5_100.js');
console.log('Einträge:', hexEntries.length);
console.log('Erster:', hexEntries[0]);
console.log('Letzter:', hexEntries[hexEntries.length - 1]);
