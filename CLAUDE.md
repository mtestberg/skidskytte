# Skidskytte-stafett – mobilspel i webbläsaren

Överlämning från en chatt med Maja. Svara på svenska.

## FÖRSTA STEGET I SESSIONEN
Bygg ingenting förrän du har ställt frågorna i avsnittet "Öppna frågor" till Maja (använd AskUserQuestion, max 4 per omgång, i flera omgångar) och fått svar. Skriv sedan in svaren i denna fil under "Beslut" och börja bygga.

## Koncept
Ett spel som simulerar en sträcka i en skidskyttestafett, spelbart i mobilens webbläsare.
Lopp: åkning → liggande skytte → åkning → stående skytte → åkning → målgång (3 varv).

### Fas 1 – Skidåkning (tredjepersonsvy, 3D)
- Två knappar: **stavtag** och **skär**. De ska tryckas i takt med en **pendel**.
- Bäst resultat: båda knapparna samtidigt och precis på pendeln. Bara en knapp ger sämre fart.
- Pendelns takt följer banans lutning: långsam takt i utförsbackar, snabb i uppförsbackar.
- Ju längre från pendeln man trycker, desto längre tid till nästa "pendelmatch" (= lägre fart).
- Ju bättre träff, desto lugnare puls. Snabb/slarvig åkning ger högre puls.
- Synligt i UI: pulsmätare, avstånd kvar till skjutvallen/målet, varv.
- Minikarta i ett hörn med banan och övriga spelare som prickar.

### Fas 2 – Skytte (5 tavlor)
- Man skjuter när man vill, men puls/ansträngning gör siktet ostadigt.
- Tre kontroller:
  1. **Sikta**: grovinställning av siktet; siktet svajar mer ju högre pulsen är (rörelse i en åtta runt siktpunkten).
  2. **Hold breath** (inspirerat av Call of Duty): håll in för stillare sikte, bara en begränsad tid; när man släpper blir man andfådd och svajet ökar.
  3. **Avfyra**.
- **Liggande**: mindre träffyta, mindre svaj. **Stående**: större träffyta, mer svaj.

### Multiplayer
- Spela mot varandra (behöver inte synas i 3D-vyn), se varandra som prickar på minikartan.
- Gemensam resultatlista.

## Tekniska beslut (redan bestämda)
- **Gratis plattformar**.
- **Rendering**: Three.js, mobilen först (touch, prestanda, stiliserad low-poly-grafik).
- **Ingen Cesium/Google 3D Tiles live** (tungt på mobil, och villkoren tillåter inte att datan sparas och bakas in). Istället:
  - Hämta höjddata **en gång** och baka in den till en lätt höjdkarta (PNG/binärfil) i repot. Källor: Södertyrolens öppna DTM-data (Antholz/Anterselva), IGN RGE ALTI (Le Grand-Bornand/Annecy), och Copernicus DEM 30 m som reserv.
  - Spårets linje hämtas från OpenStreetMap (piste:type=nordic) eller en GPX-fil.
  - Spårets höjdprofil styr pendelns takt.
  - Ett build-skript (Node eller Python) gör om rådata till spelets format. Den bearbetade datan checkas in, inte rådatan.
- **Multiplayer/resultatlista**: Firebase Realtime Database (Spark-planen) eller Supabase. Välj det som är enklast och förklara valet för Maja.
- **Hosting**: GitHub Pages, Netlify eller Cloudflare Pages.
- Claude bedömer själv de detaljer som inte står i frågorna nedan och förklarar viktiga val kort.

## Föreslagen ordning
1. Prototyp för en spelare med stiliserad bana: pendel, puls, åkning, båda skjutningarna, tid. Gör den spelbar på mobilen tidigt, så att spelkänslan kan testas.
2. Riktig bana (höjdkarta + spår) inbakad.
3. Multiplayer: prickar på minikartan + resultatlista.
4. Finputs: ljud, balansering, grafik.

## Öppna frågor (ställ dessa till Maja först)
Regler och format
1. Extraskott (3 per skjutning, laddas för hand) och 150 m straffrunda per missad tavla, som i en riktig stafett? Eller förenkla?
2. Hur lång ska ett lopp vara i spelet? En riktig sträcka tar 18–20 min. Ska det vara 3–5 min eller kortare (skalning/tidskomprimering)?
3. En sträcka (3 varv) eller en riktig stafett där lag om 4 spelare växlar?
4. Vilken bana börjar vi med, Antholz eller Annecy-Le Grand-Bornand? Herr- eller dambana (7,5 / 6 km)?

Åkning
5. Hur ska pendeln se ut: en svängande pendel med träffzon i mitten, en krympande ring eller en takt/rytm-indikator?
6. Vad händer om man inte trycker alls (glid, fartförlust, pulsen sjunker)?
7. Ska pulsen sjunka i utförsbackar/vid glid, så att man kan taktiskt vila inför vallen?

Skytte
8. Sikta med tummen (dra) eller genom att luta telefonen (gyro)? Eller valbart?
9. Hold breath: ungefär hur länge (3–5 s)? Ska andan återhämtas medan man vilar på vallen eller bara mellan skott?
10. Ska klockan gå under skyttet, så att det kostar tid att vänta in pulsen?

Multiplayer
11. Samtidig start i realtid, eller spela när man vill mot andras tider/"spöken"? Eller båda?
12. Identifiering: bara ett namn, eller inloggning (t.ex. Google)? Privata rum med kod?
13. En global resultatlista, eller per rum/tävling?

Övrigt
14. Ljud (skott, andning, puls)? Stiliserad eller realistisk grafik (förslag: stiliserad)?
15. Landskaps- eller porträttläge (förslag: landskap)?
16. Var ska koden ligga: nytt GitHub-repo (namn?) och vilken hosting?

## Beslut
Majas svar 2026-11-18. Frågorna ovan är besvarade; ställ dem inte igen.

Regler och format
1. **Inga extraskott.** 5 skott per skjutning, 150 m straffrunda per missad tavla (som i sprint).
2. **3–5 minuter per lopp.** Åkningen tidskomprimeras (sträckan rör sig 5× snabbare än verklig fart). Klockan går i realtid under skyttet.
3. **En sträcka (3 varv) först.** Lagstafett med 4 spelare kan läggas till senare.
4. **Le Grand-Bornand (Annecy), dambanan 6 km = 3 × 2 km** (ändrat från herrarnas 3 × 2,5 km efter test 3, för kortare åktid). Liggande efter varv 1, stående efter varv 2.

Åkning
5. **Svängande pendel** med träffzon i mitten.
6. **Inga tryck = glid**: farten sjunker (fortare i uppför), pulsen sjunker.
7. **Ja, pulsen sjunker i utförsbackar och vid glid** så att man kan vila taktiskt inför vallen.

Skytte
8. **Valbart sikte: tummen (dra) som standard**, gyro kan slås på i inställningarna.
9. **Håll andan ca 4 s.** Andan återhämtas hela tiden när man inte håller in (även mellan skott).
10. **Klockan går under skyttet**, så det kostar tid att vänta in pulsen.

Multiplayer
11. **Båda**: först spöken/andras tider (spela när man vill), sedan samtidig realtidsstart i rum.
12. **Namn + privata rum med kod.** Ingen inloggning.
13. **Global resultatlista + resultat per rum.**

Övrigt
14. **Mer realistisk grafik + ljud** (skott, andning, puls). Prestandan på mobil får inte offras: realism via ljus, skuggor, dimma, material och detaljerade modeller, inte tunga texturer.
15. **Landskapsläge.**
16. **Nytt GitHub-repo `skidskytte`, hosting på GitHub Pages.**

Claudes tekniska val
- **Backend: Firebase Realtime Database (Spark-planen).** Enklast för realtidsprickar på minikartan (inbyggd presence/onDisconnect, ingen server eller SQL), gratis och fungerar direkt från en statisk GitHub Pages-sida.
- **Ingen byggkedja.** Ren ES-moduler + Three.js r170 vendrad i `vendor/` (ingen CDN-risk, fungerar direkt på GitHub Pages).
- Prototypens bana är procedurell (en slinga på exakt 2,5 km med höjdprofil). Byts mot riktig höjddata och spår från Le Grand-Bornand i steg 2.

### Feedback efter första speltestet (2026-11-18)
- **Format heter Sprint** (5 skott, straffrunda per miss), inte stafett.
- **Liggande var för lätt**, stående lagom. Liggande görs svårare (mer svaj).
- **Högre puls i åkningen** så att allt blir lite svårare.
- **Energi**: en total energibudget för loppet (0–100 %).
  - Låg energi → pulsen stiger snabbare och sjunker långsammare.
  - Dåliga stavtag/skär (och tryck ur takt) kostar mer energi än bra.
  - Energi återhämtas i vila (utförsbackar, glid, på vallen), men långsammare än pulsen sjunker.
  - Vid noll energi kan man fortsätta åka, men skjuten blir svagare (lägre fart).
  - (Justerat efter test 2) Energin ska räcka längre: förbrukningen är högre när man har mycket kvar och lägre när man har lite kvar, och vid 0 % är skjuten bara ca 20 % svagare, så man blir aldrig helt förslöad.
- **Nedräkning 3-2-1-KÖR** vid start så att man förstår när man ska börja åka.

### Feedback efter test 3 (2026-11-18)
- **Lätt att komma igång**: de första 2–3 tagen från stillastående (start, efter vallen/straffrundan, eller om man stannat i en backe) har en träffzon som täcker nästan hela pendeln. Hela den breda zonen ger Perfekt/Bra (inte bara mitten), och stavtag + skär behöver inte vara lika exakt samtidiga. Gäller vid start, efter vallen utan missar och om man stannat helt, men **inte på straffrundan** (den gick för fort med starthjälp).
- **Mindre energiförbrukning**, särskilt i början när energin är hög (förbrukningen planar ut i stället för att rasa).
- **HUD**: hastigheten står överst (tid · fart · avstånd); varvet visas på minikartan.
- **Dambanan 3 × 2 km** i stället för 3 × 2,5 km.
- **Höjdkurva** för varvet under minikartan, med en prick för var man är.
- **Vind i skyttet**: sidvind som varierar under loppet och flyttar träffen åt det håll det blåser. Flagga visar vinden (i kikarvyn och på vallen); ingen siffra, man läser flaggan som i verkligheten.

### Feedback efter test 4 (2026-11-18)
- **Stående skytte svårare** (i verkligheten ofta svårare än liggande): mer svaj, mer drift, att hålla andan hjälper mindre. Simulerad träffsäkerhet med perfekt sikte och ungefärlig vindläsning: stående ca 95 % vid puls 110, ca 75 % vid 125, ca 50 % vid 140, ca 40 % vid 160. Liggande ca 85–100 % i samma spann; den lilla träffytan gör liggande svårare för en människa än simuleringen visar.

Till steg 3 (multiplayer)
- **Placering** visas som "placering / antal deltagare" i HUD:en, så man slipper tolka prickarna.
- **Lobby**: när alla i rummet tryckt "Redo" startar en **nedräkning på 10 s**, sedan startar loppet.
- **Animerad prisutdelning** efter loppet: topp tre går upp på pallen och firar.

## Status
- Steg 1 (prototyp för en spelare) klar 2026-11-18: pendel, puls, åkning, liggande/stående skytte, straffrundor, tid, minikarta, ljud. Ett helt lopp med bra åkning och fullt skytte tar ca 4:15.
- Repo: github.com/mtestberg/skidskytte (publikt). GitHub Pages: https://mtestberg.github.io/skidskytte/ (Maja slår på Pages själv i Settings → Pages; API:t är inte nåbart härifrån). Även en privat claude.ai-länk finns för test (gyro fungerar inte där).
- 2026-11-18: feedback från första testet inbyggd: energi, högre puls, svårare liggande, vind + flaggor, höjdkurva, Sprint-namn. Efter energijusteringen (test 2): perfekt ≈ 4:00 med ~22 % kvar, bra ≈ 4:15 med ~16 %, glid i utför ~30 %, slarvig ≈ 5:20 med ~3 % (varv 3 ca 10 % långsammare, inte dubbelt så långsamt som innan). Nedräkning 3-2-1-KÖR vid start.
- Efter test 3: dambana 3 × 2 km. Simulerat: perfekt ≈ 3:20 inkl. skytte med ~40 % energi kvar, bra ≈ 3:30 med ~35 %, slarvig ≈ 4:10 med ~20 %, glid i utför ~50 %.
- **Steg 3 (multiplayer) byggt 2026-11-18** (före steg 2 på Majas begäran):
  - Meny: namn, Träna (ensam mot spöken), Multiplayer (skapa rum / gå med med 4-bokstavskod), Topplista.
  - Lobby: spelarlista med färg och status, Redo/Inte redo. Värden (först inne i rummet) sätter `startAt` = servertid + 10 s när alla är redo; alla klienter räknar ned mot samma tid (Firebase `.info/serverTimeOffset`). Gemensam vind i rummet (seed = startAt).
  - Under loppet: andra som prickar på minikartan, placering "X / N" i HUD:en (i mål sorteras på tid, övriga på framsteg). Live-position skickas 4 ggr/s.
  - Efter målgång: väntelista för rummet, global topplista (topp 10), och när alla i rummet är i mål: animerad prisutdelning (pall, topp tre kliver upp och firar, konfetti, namnskyltar).
  - Spöken: varje lopp spelas in (1 prov/s). I Träna åker man mot sitt eget personbästa (localStorage) och världsrekordets spöke (sparas i Firebase när någon slår rekordet).
  - Firebase-projekt: `skidskytte-6c8e1`, databas i europe-west1. Regler i `firebase-rules.json` (Maja har klistrat in dem i konsolen).
  - Firebase kan inte nås från Claudes arbetsyta (nätverket är spärrat), så multiplayer är testat med det lokala läget (två flikar via BroadcastChannel) i headless Chrome. Första riktiga testet över nätet görs av Maja på GitHub Pages.
  - Den privata claude.ai-länken kan inte nå Firebase (CSP) och kör därför lokalt läge.
- **Steg 2 förberett 2026-11-18**: `tools/build-course.mjs` (GPX/GeoJSON + GeoTIFF i WGS84 eller Lambert-93 → `data/course.json`), `Course` laddar bandatan om den finns och faller annars tillbaka på den procedurella banan. Testat med en syntetisk bana. Arbetsytan kan inte ladda ner kartdata (Overpass, Copernicus m.fl. blockeras), så rådatan måste komma från Maja. Instruktioner i `data/README.md`. Stadion Sylvie Becaert: 45.9417, 6.4275 (IBU).

### Parkerade frågor till Maja
1. Fungerar multiplayer över nätet på GitHub Pages (två telefoner i samma rum)? Firebase har inte kunnat testas härifrån.
2. ~~Spåret~~ **Besvarat 2026-11-18:** Claude ritar en egen trovärdig 2 km-slinga runt stadion utifrån terrängen (`tools/draw-loop.mjs`, klart och testat med syntetisk höjdmodell).
3. Höjdmodell: Maja laddar ner Copernicus GLO-30-rutan N45 E006 (fri, utan konto, länk i `data/README.md`) och bifogar den. Väntar på filen.

- Nästa: svar på de parkerade frågorna → steg 2 (riktig bana) → steg 4 (finputs).
- Testhake: `window.__game.step(dt)` kör spelet utan rendering (används för automatiska lopp i headless Chrome).
