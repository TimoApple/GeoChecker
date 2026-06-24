// Konvertiert _dict_5x5_1000.json in eine kleine JS-Datei mit den ersten 250 Einträgen
// Die codeList bleibt als Byte-Arrays [a,b,c,d] – aruco.js verarbeitet diese via _bytes2bin()
// _bytes2bin([162,217,94,0], 25) → korrekte 25-Bit-Binärdarstellung
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_dict_5x5_1000.json'), 'utf8'));
const codeList = raw.codeList;

// 250 Einträge (IDs 0-249)
const entries = codeList.slice(0, 250);

// Byte-Arrays direkt als JSON-Arrays ausgeben – kein Hex-Konvertierung
const arrayEntries = entries.map(arr => `[${arr.join(',')}]`);

const output = `// ArUco 5x5 Dictionary (DICT_5X5_1000) – erste 250 Einträge
// Generiert aus _dict_5x5_1000.json
// Format: 5x5 Marker, nBits=25, tau=5
// codeList: Byte-Arrays [a,b,c,d] – aruco.js verarbeitet via _bytes2bin(arr, 25)

export const ARUCO_5X5_1000 = {
  nBits: 25,
  tau: 5,
  codeList: [${arrayEntries.join(',')}]
};
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'libs', 'aruco_5x5_100.js'), output, 'utf8');
console.log('Geschrieben: src/libs/aruco_5x5_100.js');
console.log('Einträge:', arrayEntries.length);
console.log('Erster:', arrayEntries[0]);
console.log('Letzter:', arrayEntries[arrayEntries.length - 1]);
