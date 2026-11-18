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
1. Multiplayer över nätet testat av Maja 2026-11-18: **bugg** – loppet startade när en spelare tryckt Redo trots att en annan i rummet inte var redo. Orsak: när en telefon tappade anslutningen (byte av app, släckt skärm) tog Firebase bort spelaren ur rummet (`onDisconnect().remove()`), så "alla" var redo. Åtgärdat:
   - Frånkopplade spelare **stannar kvar** i rummet som "frånkopplad" och "inte redo" (`onDisconnect().update`), och registrerar sig igen automatiskt när anslutningen kommer tillbaka (`.info/connected`). Först efter 60 s frånkoppling tas de bort.
   - Start kräver att **alla i rummet** är uppkopplade, i lobbyn och har tryckt Redo.
   - Ansluter någon ny under 10 s-nedräkningen **avbryts** nedräkningen och alla går tillbaka till lobbyn (fortfarande redo).
   - Lobbyn har en instruktion: dela koden, vänta med Redo tills alla som ska vara med syns i listan, start först när alla är redo.
   - Testat med tre flikar i lokalt läge. **Bekräftat av Maja 2026-11-18: multiplayer över nätet fungerar, och prisutdelningen verkar fungera.**
2. ~~Spåret~~ **Besvarat 2026-11-18:** Claude ritar en egen trovärdig 2 km-slinga runt stadion utifrån terrängen (`tools/draw-loop.mjs`, klart och testat med syntetisk höjdmodell).
3. ~~Höjdmodell~~ **Klart 2026-11-18:** Maja skickade Copernicus GLO-30-rutan N45 E006 (ligger i `raw/`, checkas inte in).

- **Steg 2 klart 2026-11-18**: `data/course.json` = egen 2 km-slinga i dalen vid Le Grand-Bornand (förslag 5 av 5 från `draw-loop.mjs --seed 5`), riktig terräng 1,6 × 1,6 km från Copernicus (utjämnad mot hus/träd). Stadion på 920 m ö.h., stigning ca 64 m per varv. Efter Majas önskemål byggd med `--maxgrade 0.15`: brantast ±15 % (förut +21 %). Simulerat: perfekt ≈ 3:15, bra ≈ 3:35 (samma nivå som den procedurella banan). Andra förslag kan tas fram med andra `--seed`.
- **Steg 4, grafik omgång 1 (2026-11-18)**: åkare med nummerlapp, randig overall, mössa med pannband, solglasögon, böjda skidor med bindning, stavar med grepp och trissa, gevär med stock/pipa och sele; viktöverföring i skärsteget. Omgivning: pistat spår (manchesterränder, klassiska spår), röda/blå markeringspinnar, sten i branta sluttningar, smala snöiga granar med färgvariation, sol i himlen, banderoller och hoppande publik längs staketen vid stadion och på läktaren (allt instansierat, `src/scenery.js`).
- **Finputs omgång 2 (2026-11-18), Majas lista:**
  1. Pendeln har färgband: orange = tidigt/sent, gulgrön = bra, grön = perfekt (bredder enligt tidsgränserna i `skiing.js`); under starthjälpen är hela zonen grön.
  2. **Vurpa**: 3 tryck i rad utanför pendeln → åkaren ramlar (2,6 s), reser sig och börjar om från noll fart (med starthjälp). Kostar lite energi och puls.
  3. Skidorna i V med spetsarna **utåt** i skärsteget; kameran närmare åkaren.
  4. Ljud: tydligare stavisättning varje tag, glidljud efter fart, publikens sorl efter avstånd till stadion, jubel vid träff (stort vid fullt), "ååh" vid miss, varvklocka inför sista varvet, jubel vid start, upplopp och målgång.
  5. Grafik: läktare med 7 trappsteg, säten och tak längs upploppet med publik; publik med flaggor (SE, FR, NO, DE, IT) som viftar; START- och MÅL-portal (målportalen har klocka); lätt snöfall; skogen uppdelad i rutor för bättre prestanda.
  6. **Upploppsraka**: efter sista varvet fortsätter man 200 m rakt fram från stadion till målportalen (`FINISH_LEN`, läge 'm' i live/spöken).
- **Rättningar efter test (2026-11-18):** skidorna är parallella och bara det skärande benet vinklas utåt (foten förs ut, så de aldrig korsas). Ljudbugg: publikljudets variation (LFO) var kopplad direkt på nivån och kunde aldrig bli tyst → konstant "swish swish"; nu ligger variationen på en separat nod. Glidljud bara vid åkning över ca 1,5 km/h, aldrig på vallen. Publiken hörs på vallen och är starkare överlag; jubel och "ååh" dubbelt så starka; på upploppet fullt publikljud och återkommande jubelvågor.
- **Publikljud omgjort (2026-11-18):** Maja: brusbaserad publik lät som vågbrus. Nu syntetiska röster (`voice()` i `audio.js`: sågtand + vibrato → tre formantfilter för vokalerna a/e/o/i, män och kvinnor, stereo) i en publikbuss med syntetiskt stadioneko. Jubel = 30+ röster "heej/jaaa" med stigande ton + handklapp + visslingar; "ååh" = 22 röster på o med fallande ton; sorl = slumpade korta stavelser + enstaka klapp/visslingar + svagt brusgolv. Förhandslyssning kan renderas i headless Chrome via `_useContext(OfflineAudioContext)`. Riktiga inspelningar (CC0) skulle låta bättre – kan bytas in om Maja skickar filer.
- **Inspelade publikljud (2026-11-18):** Maja skickade `ooh.mp3` (Pixabay) och ett jubel (Freesound #651646 av krizin). Bearbetade till `assets/sfx/` (128 kbit/s MP3). `audio.js` laddar dem vid start och använder dem för `ooh()` och `cheer()` (jubel kortas/tonas efter situationen, lite tonhöjdsvariation varje gång); saknas filerna används de syntetiska rösterna. Licens och källor i `assets/sfx/CREDITS.md` – Freesound-jublet är **CC0 1.0** (bekräftat av Maja), ingen attribution krävs.
- **Jubel rättat (2026-11-18):** bugg – `playSample` anropade `stop()` före `start()` (InvalidStateError), så korta jubel kraschade och hördes aldrig. Jubelfilen omkodad ca 7 dB starkare. Nytt **arenajubel**: jubelinspelningen loopas (två förskjutna loopar) med volym efter läge – fullt i nedräkning/start, tonar bort när man åker ut, växer successivt de sista ca 450 m in mot stadion (starkast på sista varvet), högst på upploppet förbi läktaren, svagt på vallen och straffrundan. Korta jubel (träff, fullt, start, sista varvet, mål) spelas ovanpå. Stadionsorl: Maja skickade `crowd.mp3` (Pixabay, soundreality, 30 s) som nu loopas (två förskjutna loopar) som bakgrundssorl med volym efter avstånd till stadion; det syntetiska sorlet används bara om filen saknas.
- **Animation per knapp (2026-11-18):** bara Stavtag → åkaren stakar (armar/bål), bara Skär → åkaren skär (ben/skidor, viktöverföring), båda → båda. Ljudet följer: stavisättning bara vid stavtag, skärljud bara vid skär. Vurpa spelar "ååh" (inspelat).
- **Syntetiskt sorl borttaget (2026-11-18, Majas önskemål):** bakgrundssorlet är bara den inspelade `crowd.mp3` (inget brusgolv, babbel, klapp eller visslingar). Syntetiska röster finns kvar enbart som reserv för jubel/ååh om filerna inte laddas. Maja återkommer med ett kortare, mer direkt jubel för träff.
- **Träffjubel (2026-11-18):** `hit.mp3` (Freesound #221568, alaskarobotics, från 1 s i originalet, 6 s med uttoning) spelas vid varje träff (`hitCheer()`, ca 3 s). Vid fullt spelas dessutom det stora jublet (`cheer.mp3`), som används för alla andra jubel (start, sista varvet, arena, upplopp, mål). hit.mp3 är CC0 1.0 (bekräftat av Maja). Alla ljudfiler får användas fritt utan attribution.
- **Musik på prisutdelningen (2026-11-18):** `anthem.mp3` (Pixabay, leo_music_production, 22 s) spelas en gång när prisutdelningen börjar, med jubel ovanpå; publikljudet sänks medan musiken spelar och musiken tonas ut när man lämnar prisutdelningen.
- **Bugg rättad (2026-11-18):** `Skiing.reset()` nollställde `onBeat`/`onPush`/`onFall` vid varje nytt lopp, så vurpa-ljud ("ååh"), vurpa-rutan, stavtagsljud och taktslag försvann efter starten. Callbackarna sätts nu i konstruktorn och rörs inte av `reset()`.
- **Sorlet sänkt (2026-11-18):** bakgrundssorlet (`crowd.mp3`) sänkt till ca 40 % av tidigare nivå (`level * 0.17`).
- **Stavtag och pendel hörs bättre (2026-11-18):** stavisättningen är ett skarpt "tjack" + duns (topp ca 0,39 mot skottets 0,77), skäret ett "schhhk" som sjunker i ton, och pendelns taktslag ett träkloss-klick (topp ca 0,24) – mycket mellan-/diskantinnehåll så att det hörs i mobilhögtalare. Taktslaget hörs även på straffrundan.
- **Mjuka övergångar på stadion (2026-11-18):** inget hopp längre. Åkaren glider in från spåret till skjutmattan, åker en kurvad väg (kubisk Bézier, `src/paths.js`) från vallen över banan till straffrundan, och från straffrundan (eller vallen vid fullt) ut på banan igen vid `JOIN_S` = 50 m. Straffrundan börjar och slutar i punkten närmast banan i banans riktning. Vägarna är pistade och har öppningar i staket, banderoller och publik (`course.inLane`). Nytt läge `transit` i `main.js` (räknas som vallen i live/spöken).
- **Konor runt straffrundan (2026-11-18):** röda avlånga konor med vitt reflexband och fot längs straffrundans inner- och ytterkant (instansierade, `buildTrack` i `scenery.js`), med öppning där man åker in och ut.
- **Spurt på upploppet (2026-11-18):** `ski.sprint` (0,35 → 1 under de första ca 25 m) gör pendeln drygt dubbelt så snabb (≈ 0,56 s/slag), höjer toppfarten och pulsökningen per tag. I spurten beror tagens kraft på sparad energi (100 % ≈ 25 % starkare än 0 %). Knapparna pulserar orange, banderollen säger "Spurta!". Simulerat (200 m): perfekt spurt ca 4,6–5,0 s (upp till 37 km/h), varannan takt ca 6,2 s, var tredje 7,2 s; utan spurtläge var det 5,7 s.
- **Efter test (2026-11-18), tre ändringar:**
  - **Gyro omgjort till joystick:** lutningen styr siktets *fart*, inte läget. Neutralläget sätts när skyttet börjar (dubbeltryck i kikaren = nytt nolläge). Ratt-lutning (vänster/höger) → sidled, överkanten bakåt/framåt → höjdled; 2,5° dödzon, mer lutning = snabbare (8° ≈ en tavla/s, max ca 3 tavlor/s); rätar man upp stannar siktet. Vinklarna räknas ur världens upp-vektor (beta/gamma), så kompass-drift (alpha) och skärmläge spelar ingen roll.
  - **Tydligare spårbädd:** gråblå bädd med kraftigare manchesterränder, ojämnheter, klassiska spår och packad kant, plus en upphöjd snövall längs kanterna (tvärsnitt i `ribbon()`, `PROFILE`). Straffrundan har lägre vall, övergångarna ingen.
  - **Andra spelare syns som åkare** i multiplayer (`src/rivals.js`): egen färg på overallen, namnskylt (döljs över 160 m), utjämnad rörelse mellan live-uppdateringarna (fartskattning + korrigering), skjuter på egna mattor bredvid en, åker straffrunda och upplopp, hejar efter målgång. Döljs över 450 m. Spöken i Träna visas fortfarande bara som prickar.
- **Gyro rättat (2026-11-18, Maja fastnade under tavlan):** höjdled var omvänd mot hur man siktar med en telefon; nu gäller överkanten mot dig = siktet uppåt, bort = nedåt. Siktet är begränsat till området runt tavlorna (`AIM_LIMIT` i `shooting.js`: ±110 mm utanför yttertavlorna, 110 mm över och 160 mm under), för både tumme och gyro. Efter varje skott blir telefonens läge det nya neutralläget, så en ändrad hållning gör inte att siktet drar iväg.
- **Gyro höjdled känsligare (2026-11-18):** dödzon 1,5° (sidled 2,5°), nästan tre gånger så snabbt: 4° fällning ≈ 80 mm/s, 5° ≈ 150 mm/s, max 450 mm/s.
- **Bugg rättad: gröna zonen godtog inte alla tryck (2026-11-18).** Under starthjälpen (start, efter vallen, efter stopp/vurpa) räknades ca 46 % av trycken på den gröna pendeln som "Ur takt": (1) direkt efter `restart()` var fönstret efter slaget stängt fast pendeln stod i mitten, (2) när zonen ritades över hela pendeln fanns ändå en lucka mellan fönstren, (3) ett andra tryck på samma knapp i zonen räknades som ur takt. Nu: under starthjälpen godtas varje tryck och räknas till närmaste slag, restart öppnar fönstret direkt, och dubbeltryck i zonen ignoreras. Testat med 400 slumpade tryck: 0 ur takt (förut 185).
- **Andning kontrollerad och skärpt (2026-11-18):** man kan fortfarande hålla andan högst 4 s (`BREATH_MAX`); då tar luften slut med en flämtning. Nytt: efter det måste man andas tills mätaren är halvfull (ca 3 s) innan man kan hålla igen (`recovering`), och en ny hållning kräver minst 25 % luft (ca 1,5 s andning från tomt). Mätaren blir röd och knappen grå med texten "Andas…" så länge det inte går. Förut kunde man börja hålla igen redan efter 0,6 s.
- **Skytteträning (2026-11-18):** nytt tredje val i menyn (Träna · Tävla · Skytteträning; "Multiplayer" heter nu "Tävla"). `mode = 'practice'` går direkt till vallen utan åkning, obegränsat antal serier (ny serie startar automatiskt efter 5 skott med banner "4 av 5 · tid"). Knappar överst: byt liggande/stående (nollställer statistiken), puls vid seriestart lugn 78 / efter åkning 140 / max 170 (sjunker sedan i vila), statistik (serie, träffar, %), Avsluta. Ny vind varje serie. Inget sparas i topplistan.
- **Gyro omgjort igen (2026-11-18, Maja: siktet föll tillbaka, höjdled hamnade i topp eller botten):** joystick-läget (lutning = fart) var för svårt i höjdled och fungerade inte i praktiken. Nu följer siktet telefonens rörelse som en kamera (relativt, "mus-läge"): vrid åt sidan (panorera) eller luta som en ratt → sidled, 42 mm per grad (ca 21° över alla tavlor); överkanten mot dig → uppåt, 30 mm per grad. Håller man still ligger siktet still, inget neutralläge. Rörelser under 1,5°/s ignoreras, så man kan sakta flytta tillbaka telefonen till en bekväm hållning. Rotationen räknas med rotationsmatriser ur hela orienteringen (inte beta/gamma direkt), så vinkelhopp när telefonen står på högkant i landskap spelar ingen roll. Testat med syntetiska orienteringshändelser i stående och landskap (vinkel 90).
- **Inför lansering (2026-11-18):**
  - **Licenser i spelet:** "Om spelet och licenser" i menyn med Copernicus-notisen (krävs för bearbetad WorldDEM-30: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" + ansvarsfriskrivningen), ljudkällor, three.js (MIT), qrcode-generator (MIT, Kazuhiko Arase, `vendor/qrcode.js`).
  - **Versionsnummer på filerna** mot blandade gamla/nya moduler i cachen: `node tools/bump-version.mjs` sätter `?v=ÅÅÅÅMMDDttmm` på alla `./x.js`-importer i `src/`, `style.css` och `src/main.js` i index.html (three.js har fast `?v=r170`). **Kör skriptet före varje commit som ändrar spelet.**
  - **Hemskärm/PWA:** `manifest.webmanifest` (helskärm, landskap), ikoner i `assets/icons/` (loggförslag: korsad skida och skidskyttegevär framför en tavla med fem prickar, `icon.svg` + PNG 64/180/192/512). Tips i menyn: iPhone "Dela → Lägg till på hemskärmen", Android en installera-knapp (`beforeinstallprompt`).
  - **Städning av rum:** rum får `touched` (skapas, någon går med, start). När någon skapar ett rum tas upp till 25 rum bort som inte använts på 12 h (`Room.cleanup`). Kräver nya regler: `rooms` har `.read: true` och `.indexOn: ["touched"]` i `firebase-rules.json` – **Maja behöver klistra in reglerna igen**. Utan de nya reglerna misslyckas städningen tyst, inget annat påverkas.
  - **Namnnotis** under namnfältet: namnet syns för alla i topplistan och i rummen.
  - **QR-kod och delningslänk i lobbyn:** QR-koden pekar på `…/?rum=KOD`; öppnas länken fylls koden i och Tävla-panelen visas ("skriv ditt namn och tryck Gå med"). "Dela länk" använder telefonens delningsmeny (annars kopieras länken). Testat: QR-koden avkodas till rätt adress.
  - **Topplistan rensas av Maja** i Firebase-konsolen (Realtime Database → ta bort `leaderboard` och `ghosts`).
- **Prioritering av utbyggnad (Claude, 2026-11-18, Maja lät Claude avgöra):** 1) fler grenar (klart), 2) fler banor (Antholz, Östersund, Hochfilzen – väntar på höjddata från Maja), 3) stafett i lag om två (sist, störst).
- **Grenar (2026-11-18):** `src/formats.js` – Sprint (3 varv, L S, straffrunda), Distans (5 varv, L S L S, 1 straffminut per miss läggs på tiden, visas som "+1:00" i tidsrutan), Masstart (5 varv, L L S S, straffrunda). Val i menyn (sparas), i lobbyn väljer värden (rummets `format`, andra ser valet), topplistan har flikar per gren. Egna topplistor `leaderboard_distans` / `leaderboard_masstart` (Sprint behåller `leaderboard`), egna personbästa och spöken per gren. Energin skalas med antal varv (`ski.energyScale = 3/varv`) så att budgeten räcker. Simulerat (bra åkning): Distans ca 6 min åktid, Masstart ca 6,5–7 min. **Nya databasregler** för de nya topplistorna – Maja behöver klistra in `firebase-rules.json` igen.
- **Banor, varvlängder och miljö (2026-11-18):**
  - **Fyra banor** (`src/courses.js`, data i `data/courses/*.json`): Le Grand-Bornand (FR), Antholz-Anterselva (IT, 46.8837, 12.1525), Hochfilzen (AT, 47.4694, 12.6225), Östersund (SE, 63.1903, 14.6581). Nya slingor ritade med `draw-loop.mjs` ur Copernicus-rutorna Maja skickade (N46 E012, N47 E012, N63 E014; ligger i `raw/`), byggda med `build-course.mjs --maxgrade 0.15`. Slingor: 2000 / 1800 / 2000 / 1950 m.
  - **Varvlängd per bana och gren** (Sprint och Distans ≤ 2 km, Masstart ≤ 1,7 km, olika mellan banorna): GB 2,0 / 1,8 / 1,5 km, Antholz 1,8 / 1,8 / 1,55, Hochfilzen 1,9 / 2,0 / 1,7, Östersund 1,95 / 1,75 / 1,65 (sprint / distans / masstart). Kortare varv än slingan går via en **genväg** (`Course.findShortcut`): avfart i vinkel (spårgaffel), ingen korsning med resten av spåret, ingen höjdvägg vid avfarten, lutning ≤ 16 %. Varvlängderna anges som listor i önskad ordning; den första som har en bra genväg används (`course.lapLens`). `course.lapView(len)` ger ett varv-objekt med samma metoder som banan.
  - **Lutning in mot stadion begränsad** (data-banor): utjämningen mot stadion gav ~21 % i Hochfilzen; nu iterativ lutningsbegränsning till 14 % med stadion låst.
  - **Banval** i menyn, i lobbyn (värden väljer, rummet har `course`) och i topplistan. Världen byggs om vid byte (`buildCourse`, allt i en `worldGroup` som tas bort och frigörs). "Dam" borttaget ur rubriken.
  - **Topplistor per bana och gren:** `boards/{bana}_{gren}` (GB Sprint behåller `leaderboard`). Personbästa och spöken per bana och gren. **Nya regler** i `firebase-rules.json` (`boards/$board`) – Maja behöver klistra in dem.
  - **Miljö per bana** (`env`): mängd skog och grönskans färg, hus (chalet i Alperna, röda/gula svenska hus i Östersund) i klungor, barmark (gräs/jord i sydsluttningar), höjd på bergen, mer sten i Antholz, banderoller med banans namn, publikens flaggor viktade efter värdland (FR/IT/AT/SE + grannländer, nya flaggor AT och FI).
  - **Energi i långa grenar:** budgeten skalas per km, och per gren (`energyMul` i formats.js: Distans 1,3, Masstart 1,2) så att man har ca 10–20 % kvar i mål (Majas önskemål efter att 40–57 % var för snällt). Simulerat med bra åkning och 14–16/20 träffar: Distans ca 18 %, Masstart ca 9–17 %, Sprint ca 14 %.
- **Stadion omgjord och överlapp borttagna (2026-11-18, Majas test i Östersund – man åkte genom publiken på läktaren):**
  - Orsak: slingan i Östersund gick efter stadion rakt in där läktaren stod längs upploppet. Nu: **läktaren står mitt emot skjutvallen och blickar ut över den** – läktare (−normal, 9–18 m från spåret, 70 m bred) – spår – mattor – tavlor, som på riktiga arenor. **Straffrundan** ligger vid sidan av läktaren (`PEN_U` = 75 m längs stadion) så den inte skymmer vallen; `JOIN_S` = 130 m (man kommer ut på banan efter straffrundan). Läktarens läge längs stadion väljs så att slingan inte är i vägen (`pickGrandstand`). Prisutdelningen står framför läktaren.
  - `course.inStadiumZone` (läktare, skjutvall, straffrunda, upplopp) och `course.trackDist`: genvägar får inte gå genom zonerna, och publik/staket/banderoller ställs aldrig på eller intill ett spår eller i zonerna. Kontrollerat för alla fyra banor: inga överlapp för slinga, genvägar och övergångar.
  - **Konor vid spårgafflarna:** kör man ett varv med genväg spärras slingan av efter avfarten och före påfarten; annars spärras genvägen av i båda ändar (`setBarriers(varvlängd)`, växlas när gren/bana väljs). Markeringspinnar ställs inte på genvägarna.
  - **Vind per bana:** `env.wind` (`Wind(rand, { min, max, amp, cap })`). Östersund: alltid blåsigt, 2,5–4 m/s grundvind och kraftigare byar (medel ca 3,3 m/s mot 1,5 annars, max 7). Flaggorna når full utslag först vid 6 m/s.
- **Idéer till senare (Maja, 2026-11-18):** "Följ loppet"-vy: gå med i ett rum med koden och välj "bara titta". Kameran följer åkarna snett ovanifrån som en filmkamera och växlar mellan dem (prioriterar skjutvallen och ledaren, sedan tvåan osv.), med karta över var alla är och en topplista som uppdateras live.
- Nästa: stafett i lag om två, Majas test → fler finputs.
- Testhake: `window.__game.step(dt)` kör spelet utan rendering (används för automatiska lopp i headless Chrome).
