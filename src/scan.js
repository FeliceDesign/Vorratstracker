// Kamera-gestützte Import-Funktionen:
//  - Barcode scannen (Google ML Kit, on-device) + Produktdaten von Open Food Facts
//  - MHD von einem Foto ablesen (ML Kit Texterkennung, on-device)
//
// Alles läuft nativ über Capacitor-Plugins. Im Browser (vite dev) sind die
// nativen Plugins nicht verfügbar - deshalb `isScanSupported()` vorher prüfen.

import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { TextRecognition } from '@capacitor-mlkit/text-recognition';
import { Camera } from '@capacitor/camera';

// Native Kamera-Features gibt es nur in der App, nicht im Web-Preview.
export function isScanSupported() {
  return Capacitor.isNativePlatform();
}

// ---------------------------------------------------------------------------
// Barcode
// ---------------------------------------------------------------------------

// Öffnet den systemeigenen Scanner und gibt den rohen Barcode-Wert zurück
// (oder null, wenn abgebrochen wurde).
export async function scanBarcode() {
  // Kamerarechte anfragen - schlägt der Aufruf fehl, versucht scan() es selbst.
  try {
    await BarcodeScanner.requestPermissions();
  } catch {
    // ignorieren, der Scanner fragt bei Bedarf erneut
  }

  // Der Ready-to-use-Scanner braucht auf Android das Google-Modul.
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      // Der Download läuft im Hintergrund - dem Nutzer sagen, gleich erneut zu scannen.
      const err = new Error('Scanner-Modul wird geladen. Bitte in ein paar Sekunden erneut versuchen.');
      err.code = 'MODULE_INSTALLING';
      throw err;
    }
  } catch (e) {
    if (e && e.code === 'MODULE_INSTALLING') throw e;
    // isGoogleBarcodeScannerModuleAvailable existiert nur auf Android - andere
    // Plattformen ignorieren den Schritt und scannen direkt.
  }

  const { barcodes } = await BarcodeScanner.scan();
  if (!barcodes || barcodes.length === 0) return null;
  return barcodes[0].rawValue || barcodes[0].displayValue || null;
}

// ---------------------------------------------------------------------------
// Open Food Facts
// ---------------------------------------------------------------------------

// Reihenfolge ist wichtig: speziellere Treffer zuerst prüfen.
const CATEGORY_KEYWORDS = [
  [['riegel', 'protein-bar', 'cereal-bar', 'energy-bar', 'muesli-bar'], 'Riegel'],
  [['muesli', 'müsli', 'granola', 'oat', 'hafer', 'cereal', 'flakes', 'porridge'], 'Müsli'],
  [['dried-fruit', 'trockenfrüchte', 'trockenfruechte', 'rosin', 'raisin', 'aprikose', 'pflaume', 'dattel', 'feige'], 'Trockenfrüchte'],
  [['nut', 'nuss', 'mandel', 'almond', 'cashew', 'walnus', 'pistazie', 'pistachio', 'erdnuss', 'peanut', 'haselnuss', 'hazelnut', 'paranuss'], 'Nüsse'],
  [['chocolate', 'schokolade', 'candy', 'sweet', 'süß', 'suess', 'bonbon', 'gummi', 'keks', 'cookie', 'biscuit', 'praline', 'dessert'], 'Süßigkeiten'],
  [['chips', 'crisp', 'cracker', 'salzgeb', 'salzig', 'popcorn', 'pretzel', 'brezel', 'snack'], 'Salziges'],
  [['legume', 'bean', 'lentil', 'bohne', 'linse', 'chickpea', 'kichererbse', 'hülsenfr', 'huelsenfr'], 'Hülsenfrüchte'],
  [['canned', 'konserve', 'tinned', 'dose'], 'Konserven'],
  [['pasta', 'noodle', 'nudel', 'spaghetti', 'rice', 'reis', 'macaroni', 'fusilli', 'penne'], 'Reis/Nudeln'],
  [['bread', 'brot', 'wrap', 'toast', 'brötchen', 'broetchen', 'backwaren', 'baguette', 'knäcke'], 'Brot'],
  [['spice', 'gewürz', 'gewuerz', 'seasoning', 'pfeffer', 'curry', 'paprika-pulver'], 'Gewürze'],
  [['sauce', 'oil', ' öl', 'öle', 'oel', 'dressing', 'ketchup', 'mayo', 'senf', 'essig', 'vinegar'], 'Saucen & Öle'],
  [['beverage', 'drink', 'getränk', 'getraenk', 'juice', 'saft', 'water', 'wasser', 'soda', 'cola', 'limonade', 'tea', 'tee', 'coffee', 'kaffee'], 'Getränke'],
  [['milk', 'dairy', 'cream', 'cheese', 'yog', 'jog', 'butter', 'quark', 'skyr', 'sahne', 'milch', 'käse', 'kaese', 'mozzarella'], 'Milchprodukte'],
  [['fish', 'fisch', 'lachs', 'salmon', 'thun', 'tuna', 'seafood', 'shrimp', 'garnele'], 'Fisch'],
  [['meat', 'poultry', 'chicken', 'beef', 'pork', 'sausage', 'wurst', 'fleisch', 'hähnchen', 'haehnchen', 'hühner', 'schwein', 'rind', 'pute', 'speck', 'bacon', 'schinken'], 'Fleisch'],
  [['vegetable', 'gemüse', 'gemuese', 'brokkoli', 'broccoli', 'spinat', 'möhre', 'karotte', 'tomate', 'erbse', 'mais'], 'Gemüse'],
  [['fruit', 'obst', 'berry', 'beere', 'apfel', 'banane', 'apple', 'banana'], 'Obst'],
];

function mapCategory(offCategoriesText) {
  const hay = (offCategoriesText || '').toLowerCase();
  if (!hay) return 'Sonstiges';
  for (const [keywords, cat] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => hay.includes(k))) return cat;
  }
  return 'Sonstiges';
}

// Wandelt die Open-Food-Facts-Mengenangabe (z.B. "500 g", "1 l") in die
// App-Einheiten stk/g/ml um.
function parseQuantity(quantityStr) {
  const s = (quantityStr || '').toLowerCase();
  const m = s.match(/([\d]+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (!m) return { qty: 1, unit: 'stk' };
  const num = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(num) || num <= 0) return { qty: 1, unit: 'stk' };
  switch (m[2]) {
    case 'kg': return { qty: Math.round(num * 1000), unit: 'g' };
    case 'g': return { qty: Math.round(num), unit: 'g' };
    case 'l': return { qty: Math.round(num * 1000), unit: 'ml' };
    case 'cl': return { qty: Math.round(num * 10), unit: 'ml' };
    case 'ml': return { qty: Math.round(num), unit: 'ml' };
    default: return { qty: 1, unit: 'stk' };
  }
}

// Fragt Open Food Facts nach einem Barcode. Gibt die vorbefüllbaren Felder
// zurück oder null, wenn das Produkt nicht bekannt ist.
export async function lookupOpenFoodFacts(barcode) {
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,product_name_de,generic_name,generic_name_de,brands,quantity,categories,categories_tags`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let json;
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    json = await res.json();
  } finally {
    clearTimeout(timeout);
  }

  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product;

  const rawName = (p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
  const name = rawName ? rawName.replace(/\s+/g, ' ') : (p.brands ? String(p.brands).split(',')[0].trim() : '');
  if (!name) return null;

  const catText = [p.categories, (p.categories_tags || []).join(' ')].join(' ');
  const { qty, unit } = parseQuantity(p.quantity);

  return { name, category: mapCategory(catText), qty, unit };
}

// Komfort: scannen und direkt nachschlagen. Liefert immer den Barcode mit,
// auch wenn kein Produkt gefunden wurde (dann product = null).
export async function scanAndLookup() {
  const barcode = await scanBarcode();
  if (!barcode) return null;
  let product = null;
  try {
    product = await lookupOpenFoodFacts(barcode);
  } catch {
    // Netzwerkfehler o.ä. - Barcode trotzdem zurückgeben, Nutzer füllt manuell aus
    product = null;
  }
  return { barcode, product };
}

// ---------------------------------------------------------------------------
// MHD per Foto ablesen
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeYear(yy) {
  const n = parseInt(yy, 10);
  if (yy.length === 4) return n;
  // zweistellig: bei Lebensmitteln immer 20xx
  return 2000 + n;
}

// Sucht in erkanntem Text nach plausiblen Datumsangaben und wählt das
// wahrscheinlichste MHD (das späteste Datum in einem sinnvollen Fenster).
export function parseBestBeforeDate(text) {
  if (!text) return null;
  const t = text.replace(/[\n\r]+/g, ' ');
  const candidates = [];

  // TT.MM.JJJJ / TT.MM.JJ  (auch mit / oder - als Trenner)
  const reFull = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g;
  let m;
  while ((m = reFull.exec(t)) !== null) {
    const day = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const year = normalizeYear(m[3]);
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      const d = new Date(year, mon - 1, day);
      if (d.getMonth() === mon - 1) candidates.push(d);
    }
  }

  // ISO JJJJ-MM-TT
  const reISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reISO.exec(t)) !== null) {
    const year = parseInt(m[1], 10);
    const mon = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      candidates.push(new Date(year, mon - 1, day));
    }
  }

  // Nur MM.JJJJ (ohne Tag) -> letzter Tag des Monats
  const reMonth = /\b(\d{1,2})[./](\d{4})\b/g;
  while ((m = reMonth.exec(t)) !== null) {
    const mon = parseInt(m[1], 10);
    const year = parseInt(m[2], 10);
    if (mon >= 1 && mon <= 12) {
      candidates.push(new Date(year, mon, 0)); // Tag 0 des Folgemonats = letzter Tag
    }
  }

  if (candidates.length === 0) return null;

  const now = new Date();
  const lower = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const upper = new Date(now.getFullYear() + 10, now.getMonth(), now.getDate());
  const inRange = candidates.filter((d) => d >= lower && d <= upper);
  const pool = inRange.length > 0 ? inRange : candidates;

  // MHD ist in der Regel das späteste plausible Datum (Produktionsdatum liegt früher).
  pool.sort((a, b) => b - a);
  return toISO(pool[0]);
}

// Fotografiert ein Produkt und liest ein Datum aus. Gibt { date, text }
// zurück; date ist null, wenn kein Datum erkannt wurde.
export async function capturePhotoAndReadDate() {
  try {
    await Camera.requestPermissions({ permissions: ['camera'] });
  } catch {
    // takePhoto fragt bei Bedarf erneut
  }

  const photo = await Camera.takePhoto({ quality: 70, correctOrientation: true });
  // takePhoto liefert uri als reinen Dateipfad (/data/.../foto.jpg) ohne Schema.
  // ML Kit (InputImage.fromFilePath) braucht aber eine file://-URI.
  let path = photo.uri || photo.webPath || '';
  if (path && !/^[a-z]+:\/\//i.test(path)) {
    path = 'file://' + path;
  }
  if (!path) return { date: null, text: '' };

  const { text } = await TextRecognition.processImage({ path });
  return { date: parseBestBeforeDate(text), text: text || '' };
}
