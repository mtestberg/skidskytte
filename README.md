# Skidskytte – sprint i mobilen

Ett skidskyttespel för mobilens webbläsare (landskapsläge). Sprint (dambanan): 3 × 2 km med liggande och stående skytte, energi och vind.

**Spela:** öppna `index.html` via en webbserver, eller GitHub Pages när repot är publicerat.

## Kontroller
- **Åkning:** tryck *Stavtag* och *Skär* samtidigt när pendeln passerar den gröna zonen. Släpp i utförsbackarna för att glida och sänka pulsen.
- **Skytte:** dra för att sikta, håll in *Håll andan* (max ca 4 s), tryck *Skjut*. Miss = 150 m straffrunda.
- **Dator:** J/K (eller mellanslag för båda). Skytte: mus, mellanslag, Enter.

## Struktur
| Fil | Innehåll |
|---|---|
| `src/course.js` | Banan: slinga, höjdprofil, stadion, straffrunda |
| `src/skiing.js` | Pendel, takt, fart, puls |
| `src/shooting.js` | Sikte, svaj (åtta), andning, träff |
| `src/world.js` | 3D: terräng, skog, stadion, åkaren |
| `src/hud.js` | Pendel och minikarta |
| `src/audio.js` | Syntetiserade ljud |
| `src/wind.js` | Varierande sidvind |
| `src/net.js` | Databaslager: Firebase eller lokalt läge (flikar på samma enhet) |
| `src/mp.js` | Rum, placering, spöken |
| `src/ceremony.js` | Prisutdelning på pallen |
| `src/config.js` | Firebase-konfiguration |
| `src/main.js` | Spelloop, tillstånd, inmatning, meny/lobby |

Ingen byggkedja: rena ES-moduler, Three.js r170 i `vendor/`.

## Köra lokalt
```
python3 -m http.server 8000
```
Öppna http://localhost:8000. För att testa på mobilen i samma nätverk: http://<datorns-ip>:8000.

## Publicera på GitHub Pages
Settings → Pages → Deploy from a branch → `main` / root.

## Multiplayer (Firebase Realtime Database)
- Konfigurationen ligger i `src/config.js` (inte hemlig). Säkerheten ligger i databasreglerna i `firebase-rules.json`, som klistras in under Realtime Database → Rules i Firebase-konsolen.
- Utan Firebase (`FIREBASE_CONFIG = null`, eller om Firebase inte går att nå) körs ett lokalt läge där multiplayer fungerar mellan flikar på samma enhet.
- Datamodell: se kommentaren överst i `src/mp.js`.
