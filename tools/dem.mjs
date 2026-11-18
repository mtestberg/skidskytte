// Läser en höjdmodell (GeoTIFF) och ger en funktion (lat, lon) → höjd i meter.
// Stöder WGS84 (EPSG:4326, t.ex. Copernicus DEM) och Lambert-93 (EPSG:2154, IGN RGE ALTI).
import fs from 'node:fs';
import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';

proj4.defs('EPSG:2154', '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

export async function readDem(file) {
  const buf = fs.readFileSync(file);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const keys = img.getGeoKeys() || {};
  const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || 4326;
  const [x0, y1, x1, y0] = img.getBoundingBox(); // minX, minY, maxX, maxY
  const W = img.getWidth(), H = img.getHeight();
  const data = (await img.readRasters({ interleave: true }));
  const nodata = img.getGDALNoData();
  const toDem = epsg === 2154 ? proj4('EPSG:4326', 'EPSG:2154') : null;
  if (epsg !== 4326 && epsg !== 2154) throw new Error(`Höjdmodellen har EPSG:${epsg}. Stöds: 4326 (WGS84) och 2154 (Lambert-93).`);
  console.log(`Höjdmodell: ${W}×${H}, EPSG:${epsg}`);
  return (lat, lon) => {
    let X = lon, Y = lat;
    if (toDem) [X, Y] = toDem.forward([lon, lat]);
    const px = ((X - x0) / (x1 - x0)) * W - 0.5;
    const py = ((y0 - Y) / (y0 - y1)) * H - 0.5;
    const i = Math.max(0, Math.min(W - 2, Math.floor(px))), j = Math.max(0, Math.min(H - 2, Math.floor(py)));
    const fx = Math.max(0, Math.min(1, px - i)), fy = Math.max(0, Math.min(1, py - j));
    const g = (a, b) => { const v = data[b * W + a]; return v === nodata || !Number.isFinite(v) ? NaN : v; };
    const v = (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fy) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fy;
    if (!Number.isFinite(v)) throw new Error(`Höjdmodellen saknar data vid ${lat.toFixed(5)},${lon.toFixed(5)} – är den beskuren för snävt?`);
    return v;
  };
}

