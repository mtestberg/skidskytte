// Grenar. Varvlängden bestäms av banan (se courses.js); här finns antal varv,
// skjutordning och hur missar straffas.
export const FORMATS = {
  sprint: {
    id: 'sprint', name: 'Sprint', laps: 3, shoots: ['prone', 'standing'], penalty: 'loop',
    desc: 'liggande, stående · 150 m straffrunda per miss',
  },
  distans: {
    id: 'distans', name: 'Distans', laps: 5, shoots: ['prone', 'standing', 'prone', 'standing'], penalty: 'time', penaltySec: 60,
    desc: 'liggande, stående, liggande, stående · 1 straffminut per miss',
  },
  masstart: {
    id: 'masstart', name: 'Masstart', laps: 5, shoots: ['prone', 'prone', 'standing', 'standing'], penalty: 'loop',
    desc: '2 × liggande, 2 × stående · straffrunda · alla startar samtidigt',
  },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const getFormat = (id) => FORMATS[id] || FORMATS.sprint;
export const kmText = (f, lapLen) => `${f.laps} × ${String(Math.round(lapLen / 50) * 50 / 1000).replace('.', ',')} km`;
// Topplistor och personbästa per bana och gren. Sprint i Le Grand-Bornand behåller
// de gamla sökvägarna så att befintliga resultat finns kvar.
export const boardPath = (courseId, f) => (courseId === 'grandbornand' && f.id === 'sprint' ? 'leaderboard' : `boards/${courseId}_${f.id}`);
export const storeKey = (courseId, f, k) => (courseId === 'grandbornand' && f.id === 'sprint' ? k : `${k}_${courseId}_${f.id}`);
