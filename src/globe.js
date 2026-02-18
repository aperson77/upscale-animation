/**
 * globe.js
 * Dark minimal globe with dot-grid overlay and quantum nodes.
 * Everything lives inside globeGroup so it rotates as a single unit.
 */

import * as THREE from 'three';

// ─── Shared constants ─────────────────────────────────────────────────────────
export const GLOBE_RADIUS = 1.5;
const NODE_RADIUS   = 0.0028;

// ─── Lat / lon → 3-D position ─────────────────────────────────────────────────
export function latLonToVec3(lat, lon, r = GLOBE_RADIUS) {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

// ─── Node data ────────────────────────────────────────────────────────────────
// revealT (seconds) = when this node fades into view.
// B1=0 (only Waterloo), B2=5 (Ontario triangle), B4=15 (rest of Canada + sats), B5=22 (global).
const GROUND_NODES = [
  // ── Beat 1 (0s) — only Waterloo ───────────────────────────────────────────
  { name: 'Waterloo', lat:  43.46, lon:  -80.52, isHero: true, revealT:  0 },
  // ── Beat 2 (5s) — Ontario triangle ────────────────────────────────────────
  { name: 'Toronto',  lat:  43.65, lon:  -79.38, revealT:  5 },
  { name: 'Ottawa',   lat:  45.42, lon:  -75.69, revealT:  5 },
];


// ─── Earth texture — canvas-generated 2-tone land/ocean ───────────────────────
// 4096×2048 canvas for high texel density. Land/water polygons in equirectangular
// projection. Water cutouts punch out major enclosed seas so they don't fill as land.

const WATER_COLOR = '#1e2028';   // dark grey    (ocean / lakes — dark like space)
const LAND_COLOR  = '#3a3d46';   // medium grey  (land — clearly lighter than water)

const LAND_POLYGONS = [
  // ── North America ──────────────────────────────────────────────────────────
  [
    // Alaska
    [-168,66],[-167,64],[-165,62],[-163,60],[-159,58],[-156,57],[-152,59],
    [-149,61],[-148,61],[-145,61],[-141,60],[-138,59],
    // Pacific coast Canada → USA
    [-136,59],[-134,58],[-131,56],[-128,52],[-126,50],[-124,49],[-124,47],
    [-124,45],[-124,43],[-122,38],[-120,35],[-118,34],
    // Baja California + Mexico Pacific
    [-117,32],[-115,30],[-113,28],[-110,24],[-106,22],[-104,20],
    // Mexico S + Central America Pacific coast
    [-100,19],[-96,16],[-92,16],[-91,16],[-90,16],[-90,18],[-89,18],
    // Yucatan + Central America to Panama
    [-87,21],[-87,18],[-84,14],[-83,11],[-82,10],[-79,9],
    // N coast Colombia → Venezuela → Trinidad
    [-76,9],[-73,11],[-68,11],[-62,11],[-61,11],[-60,11],
    // Jump to Florida (Caribbean islands omitted)
    [-81,25],[-81,28],[-80,30],[-81,32],[-80,33],
    // Gulf coast
    [-82,30],[-84,30],[-87,30],[-89,30],[-90,29],[-93,30],[-97,26],
    // Texas
    [-97,26],[-97,28],[-100,28],[-99,26],[-97,26],
    // Atlantic seaboard
    [-80,32],[-79,33],[-77,35],[-76,37],[-75,38],[-74,40],[-72,41],
    // New England
    [-70,42],[-68,44],[-67,45],[-66,44],[-64,44],[-60,46],[-57,47],[-54,47],[-53,52],
    // Labrador + Hudson Strait
    [-57,60],[-64,63],[-65,65],[-80,63],[-84,63],[-87,68],
    // Arctic Canada
    [-96,73],[-110,73],[-120,70],[-130,71],[-140,70],
    // Alaska return
    [-148,60],[-153,59],[-156,58],[-160,57],[-163,56],[-165,62],[-168,66],
  ],
  // ── Greenland ────────────────────────────────────────────────────────────────
  [
    [-55,83],[-40,83],[-25,82],[-20,79],[-18,77],[-18,74],[-20,72],[-22,70],
    [-24,68],[-26,65],[-30,63],[-36,62],[-43,59],[-48,62],[-52,67],[-56,72],[-62,77],[-72,78],[-72,81],
  ],
  // ── South America ─────────────────────────────────────────────────────────
  [
    // N coast
    [-78,8],[-76,9],[-73,11],[-70,12],[-66,11],[-63,11],[-60,7],[-55,4],[-52,4],
    // Brazil NE bulge
    [-50,2],[-48,0],[-46,-2],[-44,-3],[-39,-4],[-37,-5],[-35,-8],
    // Brazil coast
    [-36,-11],[-38,-14],[-39,-18],[-40,-20],[-40,-22],[-43,-23],
    [-45,-24],[-48,-27],[-50,-29],[-51,-30],[-52,-33],[-53,-34],
    // Uruguay + Argentina
    [-57,-38],[-58,-38],[-60,-39],
    // Patagonia
    [-61,-38],[-63,-44],[-64,-48],[-65,-52],[-66,-55],[-68,-55],[-69,-54],
    // S Chile coast
    [-72,-50],[-73,-46],[-73,-42],[-72,-37],[-71,-32],[-71,-28],
    // Atacama coast
    [-70,-22],[-71,-18],[-73,-14],[-74,-10],[-76,-6],[-77,-2],[-79,0],[-80,2],
  ],
  // ── Europe mainland ────────────────────────────────────────────────────────
  [
    // Iberian Peninsula
    [-9,36],[-9,37],[-9,39],[-8,44],[-2,43],[0,44],[2,44],[3,46],
    // S France + Riviera
    [5,43],[7,44],[10,44],[12,44],[13,45],[14,46],[16,45],[17,42],
    // Dalmatia + Greece
    [18,40],[20,39],[21,38],[22,37],[24,37],[26,37],[28,36],[26,37],
    // Greece coast detail
    [23,38],[22,38],[24,38],[26,38],[28,37],[30,38],
    // Turkey
    [32,37],[36,37],[38,38],[40,38],[42,37],[44,40],
    // Black Sea N coast
    [34,43],[30,47],[28,48],[26,48],[24,48],[22,47],[30,47],
    // Baltic + N Europe
    [28,56],[22,57],[20,60],[18,60],[14,63],[10,63],
    // Norway → UK coast (mainland approximation)
    [5,62],[4,58],[3,52],[2,52],[0,51],
    // Atlantic coast
    [-2,49],[-4,48],[-5,44],[-4,44],[-2,43],[-2,44],[-4,44],
    // Portugal
    [-9,39],[-9,37],
  ],
  // ── Italy ──────────────────────────────────────────────────────────────────
  [
    [8,44],[10,44],[12,44],[13,44],[14,43],[15,42],[15,40],[16,39],[16,38],
    [15,37],[13,38],[12,38],[11,38],[10,40],[10,42],[9,44],[8,44],
  ],
  // ── Scandinavia ────────────────────────────────────────────────────────────
  [
    [5,57],[8,57],[10,58],[12,56],[14,56],[18,57],[20,60],[22,63],[24,61],
    [26,63],[28,65],[30,70],[28,71],[26,71],[22,71],[18,70],[16,69],[14,67],
    [12,65],[10,63],[8,63],[6,62],[5,62],[5,58],[5,57],
  ],
  // ── British Isles ─────────────────────────────────────────────────────────
  [[-5,50],[-4,50],[0,51],[2,51],[2,53],[1,54],[-2,54],[-2,56],[-3,57],
   [-3,58],[-4,58],[-5,58],[-5,56],[-4,56],[-2,54],[-4,52],[-5,52],[-5,50]],
  // ── Ireland ───────────────────────────────────────────────────────────────
  [[-10,52],[-8,52],[-6,52],[-6,54],[-8,55],[-10,54],[-10,52]],
  // ── Iceland ───────────────────────────────────────────────────────────────
  [[-24,63],[-20,63],[-14,63],[-13,65],[-14,66],[-16,66],[-20,67],[-24,65],[-24,63]],
  // ── Africa (single clean clockwise trace, no backtracking) ───────────────
  [
    // N coast: Morocco → Tunisia → Libya → Egypt
    [-6,36],[-2,35],[2,36],[6,37],[8,37],[10,37],[12,33],
    [15,31],[20,31],[24,31],[28,31],[32,31],[33,30],
    // Red Sea coast
    [34,29],[37,26],[38,22],
    // Eritrea + Djibouti → Horn of Africa
    [40,15],[42,12],[44,12],[45,12],[50,12],[51,11],
    // E Africa going S
    [48,11],[46,8],[44,3],[42,2],[42,-2],[40,-8],
    // Mozambique
    [40,-11],[40,-15],[36,-22],[34,-27],[32,-30],[30,-31],
    // S Africa
    [28,-34],[26,-35],[22,-35],[18,-34],[18,-32],[17,-29],
    // Angola + Congo going N
    [14,-24],[12,-18],[12,-10],[12,-5],[9,-3],[9,0],[9,4],
    // Gulf of Guinea
    [8,5],[4,6],[2,5],[-2,5],[-8,5],[-10,4],[-14,4],
    // Senegal/Guinea → Mauritania coast going N
    [-15,8],[-15,10],[-16,12],[-17,15],
    // Mauritania + Morocco W coast → Strait of Gibraltar
    [-17,21],[-14,22],[-13,27],[-9,31],[-6,36],
  ],
  // ── Madagascar ────────────────────────────────────────────────────────────
  [[44,-12],[46,-14],[48,-14],[50,-16],[50,-20],[50,-25],[48,-26],[44,-26],[43,-21],[43,-17],[44,-13]],
  // ── Arabian Peninsula ──────────────────────────────────────────────────────
  [
    [36,29],[37,22],[38,22],[40,15],[42,12],[44,12],[45,12],[50,12],[55,12],
    [56,22],[58,22],[60,22],[58,24],[57,26],[55,23],[54,24],
    [58,24],[58,26],[52,26],[50,28],[48,30],[44,30],[41,29],[38,28],[36,29],
  ],
  // ── Asia (Turkey → Siberia → SE Asia, closes cleanly at Turkey) ───────────
  [
    // Turkey W coast → Caucasus → Central Asia
    [36,37],[42,37],[44,40],[48,44],[52,44],[58,44],[60,52],[62,55],
    // W Siberia
    [68,54],[74,55],[72,62],[76,68],[82,74],[90,73],[100,73],[107,73],
    // E Siberia
    [116,72],[122,72],[130,70],[135,68],[140,70],[143,62],[145,50],[145,44],
    // Primorye → Korean border
    [138,46],[135,36],[133,34],[130,34],[128,36],[128,38],[127,37],[127,34],
    // China coast going S
    [122,32],[122,28],[120,26],[118,24],[116,22],[114,22],[110,18],[108,16],
    // Vietnam → tip of Malay Peninsula
    [106,14],[104,10],[102,2],[104,1],
    // Back NW: Myanmar, Bangladesh, India NE, Himalayas
    [100,4],[99,13],[98,20],[96,16],[96,24],[92,22],[90,22],[88,22],[86,20],
    // India E coast
    [82,16],[80,10],[78,8],[76,8],
    // India W coast + Gujarat
    [72,22],[68,22],[66,24],[64,22],[62,22],
    // Makran coast (Pakistan/Iran) → Strait of Hormuz
    [60,22],[58,22],[56,22],[54,22],[50,22],
    // Iran → Iraq → Turkey, closing the polygon cleanly
    [48,30],[46,30],[46,36],[44,40],[42,43],[40,42],[38,40],[36,37],
  ],
  // ── SE Asia mainland peninsula ─────────────────────────────────────────────
  [[98,20],[100,18],[102,18],[104,16],[106,14],[108,12],[104,1],[100,4],[98,14],[96,16],[98,20]],
  // ── Sumatra ───────────────────────────────────────────────────────────────
  [[96,5],[100,4],[104,3],[106,2],[108,-3],[106,-6],[103,-6],[100,-4],[96,2]],
  // ── Java ──────────────────────────────────────────────────────────────────
  [[106,-6],[108,-7],[110,-7],[112,-7],[115,-8],[114,-8],[110,-8],[107,-7],[106,-6]],
  // ── Borneo ────────────────────────────────────────────────────────────────
  [[108,1],[112,2],[116,5],[118,3],[118,0],[118,-4],[115,-5],[112,-3],[108,-2],[106,1]],
  // ── New Guinea ────────────────────────────────────────────────────────────
  [[131,-2],[134,-3],[136,-4],[141,-6],[144,-7],[146,-7],[148,-7],[148,-9],[144,-8],[140,-8],[136,-6],[131,-4]],
  // ── Japan main island (Honshu) ───────────────────────────────────────────
  [[130,31],[131,33],[131,34],[133,34],[135,35],[136,36],[137,36],[138,36],[140,39],[141,41],[141,43],[140,38],[137,35],[136,34],[133,34],[130,32]],
  // ── Hokkaido ──────────────────────────────────────────────────────────────
  [[140,42],[141,43],[145,44],[145,43],[142,42],[140,42]],
  // ── Korea ─────────────────────────────────────────────────────────────────
  [[126,34],[127,35],[127,37],[128,37],[129,36],[128,34],[126,34]],
  // ── Australia (single clean closed polygon) ────────────────────────────────
  [
    // NW corner → W coast going S
    [122,-18],[118,-20],[114,-22],[115,-26],[115,-30],[116,-34],
    // S coast (Great Australian Bight)
    [119,-34],[121,-34],[123,-33],[126,-34],[129,-33],[131,-32],[134,-32],
    [136,-34],[138,-35],[140,-36],
    // SE coast
    [143,-38],[147,-38],[149,-38],[150,-36],[151,-33],
    // E coast going N
    [152,-28],[153,-24],[152,-22],[150,-22],[148,-20],[145,-18],[141,-18],
    // N coast going W (chord across Gulf of Carpentaria)
    [136,-14],[132,-12],[130,-12],[128,-15],
    // Return to NW corner
    [124,-16],[122,-18],
  ],
  // ── New Zealand South Island ──────────────────────────────────────────────
  [[166,-44],[168,-46],[170,-46],[172,-44],[173,-42],[173,-41],[172,-40],[170,-42],[168,-44],[166,-44]],
  // ── New Zealand North Island ──────────────────────────────────────────────
  [[174,-37],[176,-38],[178,-38],[177,-37],[176,-36],[175,-36],[174,-38],[174,-37]],
  // ── Sri Lanka ─────────────────────────────────────────────────────────────
  [[80,10],[82,9],[82,7],[80,6],[79,7],[80,10]],
  // ── Philippines (Luzon + Mindanao simplified) ─────────────────────────────
  [[118,8],[120,9],[122,10],[124,11],[124,15],[122,18],[121,19],[120,16],[118,12],[118,8]],
  // ── Taiwan ────────────────────────────────────────────────────────────────
  [[120,22],[122,23],[122,25],[121,25],[120,24],[120,22]],
  // ── Cuba ──────────────────────────────────────────────────────────────────
  [[-84,23],[-82,23],[-79,22],[-75,20],[-74,20],[-78,22],[-82,23],[-84,23]],
  // ── Hispaniola ────────────────────────────────────────────────────────────
  [[-74,20],[-72,20],[-68,18],[-74,18],[-74,20]],
  // ── Kamchatka ─────────────────────────────────────────────────────────────
  [[155,60],[160,60],[163,60],[163,56],[160,52],[156,52],[154,57],[155,60]],
  // ── Sakhalin ──────────────────────────────────────────────────────────────
  [[142,47],[143,48],[143,52],[142,54],[141,52],[141,48],[142,47]],
];

// Major enclosed/semi-enclosed water bodies to draw over land polygons.
// These prevent large gulfs from being filled solid as land.
const WATER_CUTOUTS = [
  // Gulf of Mexico
  [[-97,30],[-90,30],[-87,30],[-84,30],[-82,30],[-81,25],[-82,25],[-85,22],
   [-88,20],[-91,18],[-95,19],[-97,22],[-97,26]],
  // Hudson Bay
  [[-80,63],[-64,63],[-64,60],[-68,57],[-76,56],[-79,62],[-83,63]],
  // Black Sea
  [[28,43],[29,43],[32,44],[36,43],[38,42],[40,42],[42,41],[42,43],[36,43],[30,44],[28,43]],
  // Caspian Sea
  [[50,37],[51,38],[52,40],[52,44],[50,45],[49,44],[48,42],[49,38],[50,37]],
  // Baltic Sea (approximate)
  [[10,55],[14,56],[18,57],[22,55],[25,58],[26,60],[22,63],[18,63],[14,60],[10,57],[10,55]],
  // ── Great Lakes (critical for Ontario triangle view) ──────────────────────
  // Accurate outlines so lakes appear in the correct positions relative to nodes.
  //
  // Lake Superior (Duluth 92°W → Sault Ste. Marie 84°W, 46–49°N)
  [[-92,47],[-90,48],[-88,49],[-86,49],[-85,48],[-84,47],[-84,46],[-86,46],[-89,46],[-92,47]],
  // Lake Michigan (Chicago 88°W–41.9°N to Straits 84.5°W–45.8°N, width ~2.5°)
  [[-87.6,41.9],[-87.8,43],[-87.5,45],[-86.5,45.8],[-85.5,45.8],[-85,44],[-86,43],[-87,42],[-87.6,41.9]],
  // Lake Huron + Georgian Bay (main body 82–83°W, Georgian Bay 79.5–81°W, 43–46°N)
  [[-83,43],[-83,44],[-82.5,44.5],[-82,45.5],[-80.5,45.8],[-80,45],[-79.5,44.5],[-80,44],[-81,44],[-81.5,43.5],[-83,43]],
  // Lake Erie (narrow: ~42–43°N, Toledo 83.5°W to Buffalo 78.9°W)
  // The lake is only ~0.5–0.8° latitude wide — must NOT extend to 41°N or 43.5°N
  [[-83.5,42.1],[-82.5,42.2],[-80.5,42.8],[-79.3,42.9],[-79.0,42.8],[-79.5,42.2],[-81,42.0],[-83.5,41.8],[-83.5,42.1]],
  // Lake Ontario (Toronto 43.65°N is ON the north shore — lake is SOUTH of Toronto)
  // North shore: Hamilton(-79.8°W,43.3°N)→Toronto waterfront→Oshawa→Kingston
  // South shore: Niagara/Buffalo→Rochester→Oswego→Kingston area
  [[-79.8,43.3],[-79.4,43.6],[-78.9,43.9],[-77.5,44.0],[-76.5,44.2],[-76.0,44.0],[-76.5,43.5],[-77.7,43.2],[-79.0,43.1],[-79.8,43.3]],
];

// Draws a polygon as a smooth closed quadratic-Bézier spline.
// Each vertex is a control point; the curve passes through edge midpoints.
// This removes blockiness from any polygon without adding extra coordinates.
function drawSmooth(ctx, pts) {
  if (pts.length < 3) return;
  ctx.beginPath();
  const n = pts.length;
  // Start at midpoint of the closing edge so the path is seamless
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const cp  = pts[i];
    const np  = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cp[0], cp[1], (cp[0] + np[0]) / 2, (cp[1] + np[1]) / 2);
  }
  ctx.closePath();
  ctx.fill();
}

function buildEarthCanvas() {
  const W = 16384, H = 8192;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // lon/lat → canvas [x, y]
  const px = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];

  // Fill ocean base
  ctx.fillStyle = WATER_COLOR;
  ctx.fillRect(0, 0, W, H);

  // Blur softens polygon edge aliasing. 2px at 8192 is very subtle.
  ctx.filter    = 'blur(2px)';
  ctx.fillStyle = LAND_COLOR;
  for (const poly of LAND_POLYGONS) {
    drawSmooth(ctx, poly.map(([lon, lat]) => px(lon, lat)));
  }

  // Punch out major enclosed water bodies (gulfs, seas) that would otherwise
  // fill solid as land inside continent polygons
  ctx.fillStyle = WATER_COLOR;
  for (const poly of WATER_CUTOUTS) {
    drawSmooth(ctx, poly.map(([lon, lat]) => px(lon, lat)));
  }

  return canvas;
}

function buildGlobeMaterial() {
  const texture = new THREE.CanvasTexture(buildEarthCanvas());
  texture.colorSpace    = THREE.SRGBColorSpace;
  texture.anisotropy    = 16;  // improves sharpness at oblique angles (globe edges)
  texture.generateMipmaps = true;
  texture.minFilter     = THREE.LinearMipmapLinearFilter;
  return new THREE.MeshBasicMaterial({ map: texture });
}

// ─── Ontario high-resolution detail canvas ────────────────────────────────────
// Covers lon −90→−70 (20°), lat 41→51 (10°) at 4096×2048 = 205 px/°.
// Applied as a co-rotating sphere-patch overlay sitting 0.0003 wu above the
// main globe surface.  This region is almost entirely land (Ontario province +
// US Great Lakes states); we fill with LAND_COLOR then punch out the Great Lakes.
// Resolution gain vs main 16384-wide equirectangular: 205÷45.5 ≈ 4.5×.
// At Beat-1 d=0.06 this gives ~1087 texture px across 1920 screen px (1.77× upscale).
function buildOntarioDetailCanvas() {
  const W = 4096, H = 2048;
  const LON_MIN = -90, LON_MAX = -70;
  const LAT_MAX = 51,  LAT_MIN = 41;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Regional projection: lon/lat → canvas pixel
  const px = (lon, lat) => [
    (lon - LON_MIN) / (LON_MAX - LON_MIN) * W,
    (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * H,
  ];
  ctx.fillStyle = LAND_COLOR;
  ctx.fillRect(0, 0, W, H);
  // Punch out Great Lakes at full regional resolution.
  ctx.filter    = 'blur(1px)';
  ctx.fillStyle = WATER_COLOR;
  for (const poly of [
    // Lake Superior (east tip — west portion outside region)
    [[-92,47],[-90,48],[-88,49],[-86,49],[-85,48],[-84,47],[-84,46],[-86,46],[-89,46],[-92,47]],
    // Lake Michigan
    [[-87.6,41.9],[-87.8,43],[-87.5,45],[-86.5,45.8],[-85.5,45.8],[-85,44],[-86,43],[-87,42],[-87.6,41.9]],
    // Lake Huron + Georgian Bay
    [[-83,43],[-83,44],[-82.5,44.5],[-82,45.5],[-80.5,45.8],[-80,45],[-79.5,44.5],[-80,44],[-81,44],[-81.5,43.5],[-83,43]],
    // Lake Erie
    [[-83.5,42.1],[-82.5,42.2],[-80.5,42.8],[-79.3,42.9],[-79.0,42.8],[-79.5,42.2],[-81,42.0],[-83.5,41.8],[-83.5,42.1]],
    // Lake Ontario
    [[-79.8,43.3],[-79.4,43.6],[-78.9,43.9],[-77.5,44.0],[-76.5,44.2],[-76.0,44.0],[-76.5,43.5],[-77.7,43.2],[-79.0,43.1],[-79.8,43.3]],
  ]) {
    drawSmooth(ctx, poly.map(([lon, lat]) => px(lon, lat)));
  }
  return canvas;
}

// ─── createGlobe ──────────────────────────────────────────────────────────────
export function createGlobe(scene) {
  const globeGroup = new THREE.Group();

  // ── 1. Base sphere — Earth texture ────────────────────────────────────────
  const sphereMat  = buildGlobeMaterial();
  const sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 256, 192),
    sphereMat,
  );
  globeGroup.add(sphereMesh);

  // ── 2. Ontario detail overlay ─────────────────────────────────────────────
  // A sphere patch (lon −90→−70, lat 41→51) floating 0.0003 above the globe
  // surface, textured with the high-res Ontario canvas.  Co-rotates with globeGroup.
  // THREE SphereGeometry phi=longitude-like, theta=polar-angle-from-north.
  //   phiStart  = (−90+180)°×π/180 = π/2
  //   phiLength = 20°×π/180
  //   thetaStart  = (90−51)°×π/180 = 39°×π/180
  //   thetaLength = 10°×π/180
  // Patch UV u=0→1 maps to lon −90→−70, v=0→1 maps to lat 51→41 — matches canvas.
  {
    const ontTex = new THREE.CanvasTexture(buildOntarioDetailCanvas());
    ontTex.colorSpace    = THREE.SRGBColorSpace;
    ontTex.anisotropy    = 16;
    ontTex.generateMipmaps = true;
    ontTex.minFilter     = THREE.LinearMipmapLinearFilter;
    const ontPatch = new THREE.Mesh(
      new THREE.SphereGeometry(
        GLOBE_RADIUS + 0.0003,
        128, 64,
        Math.PI / 2,          // phiStart
        20 * Math.PI / 180,   // phiLength
        39 * Math.PI / 180,   // thetaStart
        10 * Math.PI / 180,   // thetaLength
      ),
      new THREE.MeshBasicMaterial({ map: ontTex }),
    );
    globeGroup.add(ontPatch);
  }

  // ── 3. Ground quantum nodes ──────────────────────────────────────────────
  const nodeGeo  = new THREE.SphereGeometry(NODE_RADIUS, 32, 24);
  const nodes    = [];

  for (const data of GROUND_NODES) {
    const position = latLonToVec3(data.lat, data.lon);

    const mat = new THREE.MeshStandardMaterial({
      color:              0x000000,   // no diffuse contribution
      emissive:           new THREE.Color(0x1a85ff),
      emissiveIntensity:  1.55,
      roughness:          0,          // mirror-sharp specular → doesn't spread across sphere
      metalness:          0,
    });

    const mesh = new THREE.Mesh(nodeGeo, mat);
    mesh.position.copy(position);
    globeGroup.add(mesh);

    // Glow halo — thin transparent shell rendered inside-out for soft bloom edge
    const haloMat = new THREE.MeshBasicMaterial({
      color:       0x1a85ff,
      transparent: true,
      opacity:     0.09,
      depthWrite:  false,
      side:        THREE.BackSide,
    });
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(NODE_RADIUS * 1.9, 16, 12),
      haloMat,
    );
    mesh.add(halo);

    nodes.push({
      name:     data.name,
      lat:      data.lat,
      lon:      data.lon,
      position: position.clone(),
      mesh,
      mat,
      haloMat,
      isHero:      !!data.isHero,
      isSatellite: false,
      revealT:     data.revealT ?? 0,
      phase:    Math.random() * Math.PI * 2,
      pulseFreq: 0.35 + Math.random() * 0.25,
      cascadeConnected: false,
      cascadeColor: new THREE.Color(0x1a85ff),
    });
  }

  const heroNode    = nodes.find(n => n.isHero);
  const groundNodes = nodes.slice();

  scene.add(globeGroup);

  // ── Update called each frame ─────────────────────────────────────────────
  function update(elapsed, _dt, _progress = 1) {
    // Staged node reveal: each non-hero node has a revealT (seconds).
    // Fades from invisible → full intensity over 1 second starting at revealT.
    const BASE_INTENSITY = 1.55;
    const FADE_DUR = 1.0;
    const baseScale = 1.0;

    for (const node of nodes) {
      if (!node.isHero) {
        const fade = Math.min(Math.max((elapsed - node.revealT) / FADE_DUR, 0), 1);
        node.mesh.visible = fade > 0;
        if (fade > 0) {
          node.mat.emissiveIntensity = BASE_INTENSITY * fade;
          if (node.haloMat) node.haloMat.opacity = 0.09 * fade;
        }
      }

      // Sinusoidal scale pulse (all visible nodes including hero)
      if (node.mesh.visible || node.isHero) {
        const pulse = 1 + 0.045 * Math.sin(elapsed * node.pulseFreq * Math.PI * 2 + node.phase);
        node.mesh.scale.setScalar(baseScale * pulse);
      }
    }
  }

  return { globeGroup, sphereMesh, nodes, groundNodes, heroNode, update };
}
