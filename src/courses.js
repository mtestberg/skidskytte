// Banor. Varje bana har en egen slinga (ritad utifrån riktig terräng) och egna
// varvlängder per gren: Sprint och Distans högst 2 km, Masstart högst 1,7 km.
// Varvlängden kan anges som en lista i önskad ordning; den första som har en bra genväg används.
// Kortare varv än slingan går via en genväg (se Course.findShortcut).
// env styr miljön: skog, hus, barmark, berg och publikens flaggor.
export const COURSES = {
  grandbornand: {
    id: 'grandbornand', name: 'Le Grand-Bornand', short: 'Grand-Bornand', country: 'FR',
    file: 'data/courses/grandbornand.json', loop: 2000,
    laps: { sprint: 2000, distans: [1800, 1850, 1750], masstart: [1500, 1550, 1450, 1600] },
    env: {
      trees: 1.0, houses: 8, bare: 0.06, mountains: 1.0, greens: [0x1c3a2a, 0x234634, 0x18331f, 0x2b4a36, 0x203d2e],
      houseStyle: 'chalet', flags: { FR: 6, NO: 1, SE: 1, DE: 1, IT: 1 },
    },
  },
  antholz: {
    id: 'antholz', name: 'Antholz-Anterselva', short: 'Antholz', country: 'IT',
    file: 'data/courses/antholz.json', loop: 1800,
    laps: { sprint: 1800, distans: 1800, masstart: [1550, 1600, 1500, 1650] },
    env: {
      // 1600 m ö.h.: glesare skog (lärk/gran), mer sten och höga berg, några gårdar
      trees: 0.6, houses: 4, bare: 0.12, mountains: 1.5, greens: [0x2a3f2c, 0x34472f, 0x3d4a33, 0x2c3b2a, 0x454f3a],
      houseStyle: 'chalet', rock: 1.4, flags: { IT: 6, DE: 2, AT: 1, NO: 1, FR: 1 },
    },
  },
  hochfilzen: {
    id: 'hochfilzen', name: 'Hochfilzen', short: 'Hochfilzen', country: 'AT',
    file: 'data/courses/hochfilzen.json', loop: 2000,
    laps: { sprint: [1900, 1850, 1950], distans: 2000, masstart: [1700, 1650, 1600] },
    env: {
      // tät granskog i dalen, byn nedanför, snöfria ängsfläckar i sydsluttningar
      trees: 1.35, houses: 14, bare: 0.16, mountains: 1.2, greens: [0x173322, 0x1d3b28, 0x143020, 0x22412c, 0x1a3626],
      houseStyle: 'chalet', flags: { AT: 6, DE: 3, NO: 1, SE: 1 },
    },
  },
  ostersund: {
    id: 'ostersund', name: 'Östersund', short: 'Östersund', country: 'SE',
    file: 'data/courses/ostersund.json', loop: 1950,
    laps: { sprint: 1950, distans: [1750, 1800, 1700], masstart: [1650, 1600, 1700, 1550] },
    env: {
      // boreal skog (tall och gran), stadsbebyggelse i kanten, låga fjäll långt bort
      trees: 1.45, houses: 18, bare: 0.02, mountains: 0.4, greens: [0x1f3826, 0x274230, 0x2f4a2e, 0x1b3324, 0x2a3f2a],
      houseStyle: 'swedish', flags: { SE: 7, NO: 2, FI: 1, DE: 1 },
    },
  },
};
export const COURSE_IDS = Object.keys(COURSES);
export const getCourse = (id) => COURSES[id] || COURSES.grandbornand;
