# Bandata

`course.json` (när den finns) innehåller den riktiga banan. Spelet laddar den automatiskt; saknas filen körs den procedurella reservbanan.

Filen byggs med `tools/build-course.mjs` från två källor (rådatan läggs i `raw/`, som inte checkas in):

1. **Spåret** som GPX eller GeoJSON (en sluten slinga på ca 2 km som börjar och slutar vid stadion).
2. **Höjdmodell** som GeoTIFF (valfri men rekommenderad – ger riktig terräng runt spåret). Copernicus DEM GLO-30 (WGS84) eller IGN RGE ALTI (Lambert-93).

```
cd tools && npm install && cd ..
node tools/build-course.mjs --track raw/spar.gpx --dem raw/dem.tif \
  --start 45.9417,6.4275 --name "Le Grand-Bornand, dam 2 km"
```

`--start` är stadion Sylvie Becaert (45°56'30"N, 6°25'39"E enligt IBU). Skriptet skriver ut längd, total stigning och brantaste lutning; banan skalas till exakt 2 000 m i spelet och lutningen begränsas till ±22 %.
