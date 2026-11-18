// Grenar. Alla körs på samma 2 km-slinga; skillnaden är antal varv,
// skjutordning och hur missar straffas.
export const FORMATS = {
  sprint: {
    id: 'sprint', name: 'Sprint', laps: 3, shoots: ['prone', 'standing'], penalty: 'loop',
    desc: '3 × 2 km · liggande, stående · 150 m straffrunda per miss',
  },
  distans: {
    id: 'distans', name: 'Distans', laps: 5, shoots: ['prone', 'standing', 'prone', 'standing'], penalty: 'time', penaltySec: 60,
    desc: '5 × 2 km · liggande, stående, liggande, stående · 1 straffminut per miss',
  },
  masstart: {
    id: 'masstart', name: 'Masstart', laps: 5, shoots: ['prone', 'prone', 'standing', 'standing'], penalty: 'loop',
    desc: '5 × 2 km · 2 × liggande, 2 × stående · straffrunda · alla startar samtidigt',
  },
};
export const FORMAT_IDS = Object.keys(FORMATS);
export const getFormat = (id) => FORMATS[id] || FORMATS.sprint;
// Sprint behåller de gamla sökvägarna så att befintliga resultat finns kvar
export const boardPath = (f) => (f.id === 'sprint' ? 'leaderboard' : `leaderboard_${f.id}`);
export const storeKey = (f, k) => (f.id === 'sprint' ? k : `${k}_${f.id}`);
