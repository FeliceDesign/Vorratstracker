import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Minus, Trash2, X, Package, AlertTriangle, ShoppingCart } from 'lucide-react';

function useSystemTheme() {
  const [systemDark, setSystemDark] = useState(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  const [override, setOverride] = useState(null); // null = System folgen, 'dark'/'light' = manuell erzwungen
  const [overrideLoaded, setOverrideLoaded] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get('vorrat-theme-override');
        if (res && (res.value === 'dark' || res.value === 'light')) setOverride(res.value);
      } catch {
        // kein gespeicherter Override - System-Default bleibt aktiv
      }
      setOverrideLoaded(true);
    })();
  }, []);

  const setThemeOverride = async (value) => {
    // value: 'dark' | 'light' | null (null = zurück zu System folgen)
    setOverride(value);
    try {
      if (value === null) await window.storage.delete('vorrat-theme-override');
      else await window.storage.set('vorrat-theme-override', value);
    } catch {
      // Speichern fehlgeschlagen - Auswahl gilt trotzdem für diese Sitzung
    }
  };

  const dark = override === null ? systemDark : override === 'dark';
  return [dark, override, setThemeOverride, overrideLoaded];
}

// Zentrales Farbsystem - alle UI-Farben referenzieren dieses Objekt statt Hex-Literale zu streuen
function buildTheme(dark) {
  return dark
    ? {
        bg: '#141210', card: '#221F1A', cardAlt: '#2C2822', border: '#3A352D',
        text: '#F5F2EC', textMuted: '#B0A99C', textFaint: '#7D7669',
        inputBg: '#1B1915', overlay: 'rgba(0,0,0,0.65)',
        pillInactive: '#2C2822', pillInactiveText: '#C4BCAD',
        pillActive: '#4A4438', pillActiveText: '#F5F2EC',
        btnPrimary: '#F5F2EC', btnPrimaryText: '#141210',
        danger: '#E08FA1', dangerBg: '#332025', dangerBorder: '#4A2E34',
        success: '#7FBB84', headerText: '#FFFFFF',
      }
    : {
        bg: '#F7F5F1', card: '#FFFFFF', cardAlt: '#F0EDE7', border: '#E5E1D8',
        text: '#3A362F', textMuted: '#8A8478', textFaint: '#B5AFA3',
        inputBg: '#FAF9F6', overlay: 'rgba(30,28,24,0.4)',
        pillInactive: '#F0EDE7', pillInactiveText: '#6B665C',
        pillActive: '#3A362F', pillActiveText: '#FFFFFF',
        btnPrimary: '#3A362F', btnPrimaryText: '#FFFFFF',
        danger: '#B5556B', dangerBg: '#FBEFEF', dangerBorder: '#F0D5D9',
        success: '#4A7A4E', headerText: '#FFFFFF',
      };
}

const ZONES = [
  { id: 'K', label: 'Kühlschrank', emoji: '🧊', color: '#4A8B6F', colorDark: '#8FCBA8', bg: '#E9F3EE', bgDark: '#243830', bgActive: '#4A8B6F' },
  { id: 'F', label: 'Gefrierfach', emoji: '❄️', color: '#3B7A9E', colorDark: '#7FB8D9', bg: '#EAF3F8', bgDark: '#26333D', bgActive: '#3B7A9E' },
  { id: 'V', label: 'Vorrat', emoji: '🥫', color: '#9C7A3C', colorDark: '#D4B876', bg: '#F5F0E4', bgDark: '#3A2F1F', bgActive: '#9C7A3C' },
  { id: 'S', label: 'Snacks', emoji: '🍫', color: '#7A6BA8', colorDark: '#B3A6D9', bg: '#F0EEF8', bgDark: '#2E2A3D', bgActive: '#7A6BA8' },
];

const CATEGORIES = [
  'Milchprodukte', 'Fleisch', 'Fisch', 'Gemüse', 'Obst',
  'Reis/Nudeln', 'Brot', 'Fertigbeilagen', 'Hülsenfrüchte', 'Konserven',
  'Gewürze', 'Saucen & Öle', 'Getränke', 'Süßigkeiten', 'Riegel',
  'Müsli', 'Nüsse', 'Trockenfrüchte', 'Salziges', 'Sonstiges',
];

// MHD jetzt für alle Zonen verfügbar, pro Artikel optional
function daysUntil(mhd) {
  if (!mhd) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(mhd + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function mhdColor(days, t) {
  if (days === null) return null;
  if (days < 0) return t.danger;      // abgelaufen
  if (days <= 1) return t.danger;     // heute/morgen
  return t.textMuted;                 // alles andere unauffällig
}

function mhdLabel(days) {
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)}T überfällig`;
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days}T`;
}

// unit: 'stk' (ganze Packungen) | 'g' | 'ml' (Artikel mit exakter Gewichts-/Volumenmenge)
const SEED = [
  // KÜHLSCHRANK (11)
  { id: 'k1', zone: 'K', category: 'Milchprodukte', name: 'Emmentaler', qty: 1, unit: 'stk', mhd: null },
  { id: 'k2', zone: 'K', category: 'Milchprodukte', name: 'Frischmilch', qty: 1000, unit: 'ml', mhd: null },
  { id: 'k3', zone: 'K', category: 'Milchprodukte', name: 'Joghurt', qty: 1000, unit: 'g', mhd: null },
  { id: 'k4', zone: 'K', category: 'Milchprodukte', name: 'Kochsahne', qty: 1, unit: 'stk', mhd: null },
  { id: 'k5', zone: 'K', category: 'Milchprodukte', name: 'Mozzarella gerieben', qty: 1, unit: 'stk', mhd: null },
  { id: 'k6', zone: 'K', category: 'Milchprodukte', name: 'Skyr', qty: 1, unit: 'stk', mhd: null },
  { id: 'k7', zone: 'K', category: 'Saucen & Öle', name: 'Bacon Jalapeño Sauce', qty: 1, unit: 'stk', mhd: null },
  { id: 'k8', zone: 'K', category: 'Saucen & Öle', name: 'Chipotle Chili Sauce', qty: 1, unit: 'stk', mhd: null },
  { id: 'k9', zone: 'K', category: 'Saucen & Öle', name: 'Taco Sauce', qty: 1, unit: 'stk', mhd: null },
  { id: 'k10', zone: 'K', category: 'Saucen & Öle', name: 'Teriyaki-Sauce', qty: 1, unit: 'stk', mhd: null },
  { id: 'k11', zone: 'K', category: 'Sonstiges', name: 'Eier', qty: 15, unit: 'stk', mhd: null },
  // GEFRIERFACH (12)
  { id: 'f1', zone: 'F', category: 'Fertigbeilagen', name: 'Chorizo-Kartoffel-Pfanne', qty: 1, unit: 'stk', mhd: null },
  { id: 'f2', zone: 'F', category: 'Fertigbeilagen', name: 'Country Wedges', qty: 1, unit: 'stk', mhd: null },
  { id: 'f3', zone: 'F', category: 'Fertigbeilagen', name: 'Curly Fries', qty: 1, unit: 'stk', mhd: null },
  { id: 'f4', zone: 'F', category: 'Fertigbeilagen', name: 'Kroketten', qty: 1, unit: 'stk', mhd: null },
  { id: 'f5', zone: 'F', category: 'Fertigbeilagen', name: 'Rösti', qty: 1, unit: 'stk', mhd: null },
  { id: 'f6', zone: 'F', category: 'Fisch', name: 'Wildlachs', qty: 1, unit: 'stk', mhd: null },
  { id: 'f7', zone: 'F', category: 'Fleisch', name: 'Grillfackel', qty: 1, unit: 'stk', mhd: null },
  { id: 'f8', zone: 'F', category: 'Fleisch', name: 'Hähnchenbrust', qty: 1, unit: 'stk', mhd: null },
  { id: 'f9', zone: 'F', category: 'Gemüse', name: 'Brokkoli', qty: 1, unit: 'stk', mhd: null },
  { id: 'f10', zone: 'F', category: 'Gemüse', name: 'Butter-Gemüse', qty: 1, unit: 'stk', mhd: null },
  { id: 'f11', zone: 'F', category: 'Gemüse', name: 'Gemüsepfanne', qty: 1, unit: 'stk', mhd: null },
  { id: 'f12', zone: 'F', category: 'Obst', name: 'Beerenmischung', qty: 1, unit: 'stk', mhd: null },
  // VORRAT (18)
  { id: 'v1', zone: 'V', category: 'Brot', name: 'Protein-Wraps', qty: 1, unit: 'stk', mhd: null },
  { id: 'v2', zone: 'V', category: 'Gemüse', name: 'Möhrchen (Dose)', qty: 1, unit: 'stk', mhd: null },
  { id: 'v3', zone: 'V', category: 'Gewürze', name: 'Cayennepfeffer', qty: 1, unit: 'stk', mhd: null },
  { id: 'v4', zone: 'V', category: 'Gewürze', name: 'Hähnchengewürzsalz', qty: 1, unit: 'stk', mhd: null },
  { id: 'v5', zone: 'V', category: 'Gewürze', name: 'Knoblauch Gewürz', qty: 1, unit: 'stk', mhd: null },
  { id: 'v6', zone: 'V', category: 'Gewürze', name: 'Paprika Gewürz', qty: 1, unit: 'stk', mhd: null },
  { id: 'v7', zone: 'V', category: 'Hülsenfrüchte', name: 'Kidney Bohnen (Dose)', qty: 1, unit: 'stk', mhd: null },
  { id: 'v8', zone: 'V', category: 'Hülsenfrüchte', name: 'Linsen', qty: 2, unit: 'stk', mhd: null },
  { id: 'v9', zone: 'V', category: 'Konserven', name: 'Erbsen-Möhren-Mix', qty: 2, unit: 'stk', mhd: null },
  { id: 'v10', zone: 'V', category: 'Konserven', name: 'Gebackene Bohnen', qty: 2, unit: 'stk', mhd: null },
  { id: 'v11', zone: 'V', category: 'Milchprodukte', name: 'H-Milch', qty: 1, unit: 'stk', mhd: null },
  { id: 'v12', zone: 'V', category: 'Müsli', name: 'Dinkel-Knusper-Müsli', qty: 1, unit: 'stk', mhd: null },
  { id: 'v13', zone: 'V', category: 'Reis/Nudeln', name: 'Fusilli', qty: 1, unit: 'stk', mhd: null },
  { id: 'v14', zone: 'V', category: 'Müsli', name: 'Haferflocken', qty: 1, unit: 'stk', mhd: null },
  { id: 'v15', zone: 'V', category: 'Reis/Nudeln', name: 'Jasmin Reis', qty: 1000, unit: 'g', mhd: null },
  { id: 'v16', zone: 'V', category: 'Reis/Nudeln', name: 'Maccheroni', qty: 1, unit: 'stk', mhd: null },
  { id: 'v17', zone: 'V', category: 'Saucen & Öle', name: 'Bratöl', qty: 500, unit: 'ml', mhd: null },
  { id: 'v18', zone: 'V', category: 'Sonstiges', name: 'Sonnenblumenkerne', qty: 1, unit: 'stk', mhd: null },
  // SNACKS (18)
  { id: 's1', zone: 'S', category: 'Riegel', name: 'Erdnussriegel', qty: 1, unit: 'stk', mhd: null },
  { id: 's2', zone: 'S', category: 'Riegel', name: 'Haselnuss', qty: 1, unit: 'stk', mhd: null },
  { id: 's3', zone: 'S', category: 'Riegel', name: 'Protein Cookie Dough', qty: 1, unit: 'stk', mhd: null },
  { id: 's4', zone: 'S', category: 'Riegel', name: 'Schoko', qty: 1, unit: 'stk', mhd: null },
  { id: 's5', zone: 'S', category: 'Nüsse', name: 'Cashewkerne', qty: 1, unit: 'stk', mhd: null },
  { id: 's6', zone: 'S', category: 'Nüsse', name: 'Cashewkerne (gesalzen)', qty: 1, unit: 'stk', mhd: null },
  { id: 's7', zone: 'S', category: 'Nüsse', name: 'Mandeln', qty: 1, unit: 'stk', mhd: null },
  { id: 's8', zone: 'S', category: 'Nüsse', name: 'Nussmischung', qty: 1, unit: 'stk', mhd: null },
  { id: 's9', zone: 'S', category: 'Nüsse', name: 'Paranusskerne', qty: 1, unit: 'stk', mhd: null },
  { id: 's10', zone: 'S', category: 'Nüsse', name: 'Pistazien', qty: 1, unit: 'stk', mhd: null },
  { id: 's11', zone: 'S', category: 'Trockenfrüchte', name: 'Soft-Pflaumen', qty: 1, unit: 'stk', mhd: null },
  { id: 's12', zone: 'S', category: 'Trockenfrüchte', name: 'Trockenaprikosen', qty: 1, unit: 'stk', mhd: null },
  { id: 's13', zone: 'S', category: 'Nüsse', name: 'Walnusskerne', qty: 1, unit: 'stk', mhd: null },
  { id: 's14', zone: 'S', category: 'Süßigkeiten', name: 'Cookies Dark Choc', qty: 1, unit: 'stk', mhd: null },
  { id: 's15', zone: 'S', category: 'Süßigkeiten', name: 'Goldbären Sauer', qty: 1, unit: 'stk', mhd: null },
  { id: 's16', zone: 'S', category: 'Sonstiges', name: 'Pfefferminz-Bonbons', qty: 1, unit: 'stk', mhd: null },
  { id: 's17', zone: 'S', category: 'Süßigkeiten', name: 'Pick Ups', qty: 1, unit: 'stk', mhd: null },
  { id: 's18', zone: 'S', category: 'Süßigkeiten', name: 'Zartbitter-Schokoladenkugeln', qty: 1, unit: 'stk', mhd: null },
];

function useStorage(key, seed) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(key);
        setData(res ? JSON.parse(res.value) : seed);
      } catch {
        setData(seed);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded || data === null) return;
    (async () => {
      try {
        await window.storage.set(key, JSON.stringify(data));
      } catch {
        // silent - local state still holds the truth for this session
      }
    })();
  }, [data, loaded, key]);

  return [data, setData, loaded];
}

function CategoryPicker({ value, onChange, t, inputStyle }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputStyle, textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>{value}</span>
        <span style={{ color: t.textFaint, fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 25 }}
          />
          <div
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: t.card, border: `1px solid ${t.border}`, borderRadius: 12,
              maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              zIndex: 26,
            }}
          >
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
                  border: 'none', background: c === value ? t.cardAlt : 'transparent',
                  color: c === value ? t.text : t.pillInactiveText,
                  fontWeight: c === value ? 700 : 500, fontSize: 14.5, cursor: 'pointer',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ItemRow({ item, t, dark, justChanged, onEdit, onChangeQty, onRemove, showZoneBadge, isLast }) {
  const z = ZONES.find((zz) => zz.id === item.zone) || ZONES[0];
  const accent = dark ? z.colorDark : z.color;
  const accentBg = dark ? z.bgDark : z.bg;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '13px 14px',
        borderBottom: !isLast ? `1px solid ${t.border}` : 'none',
        background: justChanged === item.id ? accentBg : 'transparent',
        transition: 'background 0.3s ease',
      }}
    >
      <div onClick={() => onEdit(item)} style={{ cursor: 'pointer', minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, color: t.text, fontWeight: 500 }}>{item.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 1 }}>
          {showZoneBadge && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: accent }}>
              {z.emoji} {z.label}
            </span>
          )}
          {item.mhd && (
            <span style={{ fontSize: 11, fontWeight: 600, color: mhdColor(daysUntil(item.mhd), t) }}>
              MHD {mhdLabel(daysUntil(item.mhd))}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => onChangeQty(item.id, -1)}
          style={btnCircle(t.cardAlt, t.pillInactiveText)}
          aria-label={`${item.name} Menge verringern`}
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <span
          onClick={() => (item.unit !== 'stk' ? onEdit(item) : null)}
          style={{
            minWidth: item.unit === 'stk' ? 20 : 46,
            textAlign: 'center', fontSize: 14, fontWeight: 700, color: accent,
            cursor: item.unit !== 'stk' ? 'pointer' : 'default',
          }}
        >
          {item.unit === 'stk' ? `${item.qty}x` : `${item.qty}${item.unit}`}
        </span>
        <button
          onClick={() => onChangeQty(item.id, 1)}
          style={btnCircle(accentBg, accent)}
          aria-label={`${item.name} Menge erhöhen`}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => onRemove(item.id)}
          style={{ ...btnCircle('transparent', t.danger), marginLeft: 2 }}
          aria-label={`${item.name} entfernen`}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default function VorratApp() {
  const [dark, themeOverride, setThemeOverride, themeLoaded] = useSystemTheme();
  const t = buildTheme(dark);
  const [items, setItems, loaded] = useStorage('vorrat-items-v6', SEED);
  const [shopping, setShopping, shoppingLoaded] = useStorage('vorrat-shopping-v1', []);
  const [showShopping, setShowShopping] = useState(false);
  const [search, setSearch] = useState('');
  const [deletedItem, setDeletedItem] = useState(null);
  const undoTimerRef = useRef(null);
  const [activeZone, setActiveZone] = useState('K');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [importError, setImportError] = useState('');
  const [newItem, setNewItem] = useState({ name: '', category: CATEGORIES[0], qty: 1, unit: 'stk', mhd: null });
  const [justChanged, setJustChanged] = useState(null);
  const [editItem, setEditItem] = useState(null); // Artikel-Objekt während Bearbeiten, sonst null
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exportZones, setExportZones] = useState(['K', 'F', 'V', 'S']); // Standard: alle ausgewählt
  const [exportCopied, setExportCopied] = useState(false);

  const zone = ZONES.find((z) => z.id === activeZone);
  const zoneIds = ZONES.map((z) => z.id);
  const labelStyle = makeLabelStyle(t);
  const inputStyle = makeInputStyle(t, dark);

  const findCategory = (raw) => {
    const norm = (raw || '').trim().toLowerCase();
    if (!norm) return 'Sonstiges';
    const exact = CATEGORIES.find((c) => c.toLowerCase() === norm);
    if (exact) return exact;
    const partial = CATEGORIES.find(
      (c) => c.toLowerCase().includes(norm) || norm.includes(c.toLowerCase().split(' ')[0].replace(/[()]/g, ''))
    );
    return partial || 'Sonstiges';
  };

  // Parst Zeilen im Format "Zone | Kategorie | Artikel | Menge" oder
  // Markdown-Tabellenzeilen "| Kategorie | Artikel | Menge |" unter einer Zonen-Überschrift.
  const parseImport = (text) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = [];
    let currentZone = null;
    const zoneHeaderRe = /(KÜHLSCHRANK|KUEHLSCHRANK|GEFRIERFACH|VORRAT|SNACKS)/i;

    lines.forEach((line) => {
      const zh = line.match(zoneHeaderRe);
      if (zh) {
        const map = { KÜHLSCHRANK: 'K', KUEHLSCHRANK: 'K', GEFRIERFACH: 'F', VORRAT: 'V', SNACKS: 'S' };
        currentZone = map[zh[1].toUpperCase()];
        return;
      }
      if (/^[-|:\s]+$/.test(line)) return; // Tabellen-Trennzeile
      if (/^(KATEGORIE|ZONE)\b/i.test(line.replace(/\|/g, '').trim())) return; // Header-Zeile

      let cells = null;
      if (line.includes('|')) {
        cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
      } else if (line.includes('\t')) {
        cells = line.split('\t').map((c) => c.trim()).filter(Boolean);
      }
      if (!cells || cells.length < 2) return;

      // MHD-Erkennung: eine Zelle im Format JJJJ-MM-TT, egal an welcher Position (3. oder 4. Spalte je nach Zeilen-Variante)
      const mhdRe = /^\d{4}-\d{2}-\d{2}$/;
      let mhd = null;
      const mhdIdx = cells.findIndex((c) => mhdRe.test(c));
      if (mhdIdx >= 0) {
        mhd = cells[mhdIdx];
        cells = cells.filter((_, i) => i !== mhdIdx);
      }

      let z, cat, name, qtyRaw;
      if (cells.length >= 4 && zoneIds.includes(cells[0].toUpperCase())) {
        [z, cat, name, qtyRaw] = cells;
        z = z.toUpperCase();
      } else if (cells.length >= 3) {
        z = currentZone;
        [cat, name, qtyRaw] = cells;
      } else {
        return;
      }
      if (!z || !name) return;
      const raw = (qtyRaw || '1x').trim();
      const gmlMatch = raw.match(/(\d+)\s*(g|ml)\b/i);
      let qty, unit;
      if (gmlMatch) {
        qty = parseInt(gmlMatch[1], 10);
        unit = gmlMatch[2].toLowerCase();
      } else {
        const stkMatch = raw.match(/(\d+)/);
        qty = stkMatch ? parseInt(stkMatch[1], 10) : 1;
        unit = 'stk';
      }
      parsed.push({ id: 'i' + Date.now() + Math.random().toString(36).slice(2, 7), zone: z, category: findCategory(cat), name, qty, unit, mhd });
    });
    return parsed;
  };

  const runImport = () => {
    setImportError('');
    const parsed = parseImport(importText);
    if (parsed.length === 0) {
      setImportError('Keine Artikel erkannt. Format: Zone-Überschrift (z.B. "KÜHLSCHRANK") gefolgt von Zeilen "Kategorie | Artikel | Menge".');
      return;
    }
    setItems((prev) => {
      if (importMode === 'replace') return parsed;
      // merge: gleicher Name + gleiche Zone -> Menge addieren, sonst neu anlegen
      const next = [...prev];
      parsed.forEach((p) => {
        const idx = next.findIndex((i) => i.zone === p.zone && i.name.toLowerCase() === p.name.toLowerCase());
        if (idx >= 0 && next[idx].unit === p.unit) {
          next[idx] = { ...next[idx], qty: next[idx].qty + p.qty, mhd: p.mhd || next[idx].mhd };
        } else if (idx >= 0) {
          // Einheit weicht ab (z.B. bisher stk, jetzt g) -> importierte Angabe übernimmt Vorrang
          next[idx] = { ...next[idx], qty: p.qty, unit: p.unit, mhd: p.mhd || next[idx].mhd };
        } else {
          next.push(p);
        }
      });
      return next;
    });
    setImportText('');
    setShowImport(false);
  };

  const grouped = useMemo(() => {
    if (!items) return [];
    const inZone = items.filter((i) => i.zone === activeZone);
    const byCat = {};
    inZone.forEach((i) => {
      if (!byCat[i.category]) byCat[i.category] = [];
      byCat[i.category].push(i);
    });
    return Object.entries(byCat)
      .sort(([a], [b]) => a.localeCompare(b, 'de'))
      .map(([cat, list]) => [cat, list.sort((a, b) => a.name.localeCompare(b.name, 'de'))]);
  }, [items, activeZone]);

  // Suche läuft bewusst über ALLE Zonen - der Sinn ist ja "hab ich das noch irgendwo?"
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !items) return null;
    return items
      .filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [items, search]);

  const buildExportText = (zoneIdList) => {
    const zonesToExport = ZONES.filter((z) => zoneIdList.includes(z.id));
    if (zonesToExport.length === 0) return '— keine Zone ausgewählt —';
    const blocks = zonesToExport.map((z) => {
      const inZone = items.filter((i) => i.zone === z.id);
      const hasMhd = inZone.some((i) => i.mhd);
      const byCat = {};
      inZone.forEach((i) => {
        if (!byCat[i.category]) byCat[i.category] = [];
        byCat[i.category].push(i);
      });
      const rows = Object.entries(byCat)
        .sort(([a], [b]) => a.localeCompare(b, 'de'))
        .flatMap(([cat, list]) =>
          list.sort((a, b) => a.name.localeCompare(b.name, 'de')).map((i) => {
            const base = [cat, i.name, i.unit === 'stk' ? `${i.qty}x` : `${i.qty}${i.unit}`];
            return hasMhd ? [...base, i.mhd || '—'] : base;
          })
        );
      if (rows.length === 0) {
        return `${z.emoji} ${z.label.toUpperCase()} (${z.id})\n— leer —`;
      }
      const cols = hasMhd ? ['KATEGORIE', 'ARTIKEL', 'MENGE', 'MHD'] : ['KATEGORIE', 'ARTIKEL', 'MENGE'];
      const widths = cols.map((c, idx) => Math.max(c.length, ...rows.map((r) => r[idx].length)));
      const pad = (s, w) => s + ' '.repeat(w - s.length);
      const header = cols.map((c, idx) => pad(c, widths[idx])).join(' | ');
      const sep = widths.map((w) => '-'.repeat(w)).join('-|-');
      const body = rows.map((r) => r.map((cell, idx) => pad(cell, widths[idx])).join(' | ')).join('\n');
      return `${z.emoji} ${z.label.toUpperCase()} (${z.id})\n${header}\n${sep}\n${body}`;
    });
    return blocks.join('\n\n');
  };

  const [exportCopyFailed, setExportCopyFailed] = useState(false);

  const copyExport = async () => {
    const text = buildExportText(exportZones);
    setExportCopyFailed(false);

    // Erster Versuch: moderne Clipboard-API
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setExportCopied(true);
        setTimeout(() => setExportCopied(false), 1800);
        return;
      }
    } catch {
      // fällt durch zum Fallback unten
    }

    // Fallback: unsichtbares Textfeld + execCommand (funktioniert in mehr eingebetteten Umgebungen)
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        setExportCopied(true);
        setTimeout(() => setExportCopied(false), 1800);
        return;
      }
      throw new Error('execCommand fehlgeschlagen');
    } catch {
      setExportCopyFailed(true);
      setTimeout(() => setExportCopyFailed(false), 3000);
    }
  };

  const toggleExportZone = (id) => {
    setExportZones((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  };

  const flashTimerRef = useRef(null);

  const flash = (id) => {
    setJustChanged(id);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setJustChanged((cur) => (cur === id ? null : cur)), 350);
  };

  // Feinere Schritte bei kleinen Restmengen - sonst löscht ein Klick bei 30g den Artikel
  const stepFor = (unit, qty) => {
    if (unit !== 'g' && unit !== 'ml') return 1;
    return qty <= 100 ? 10 : 50;
  };

  const changeQty = (id, direction) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const nextQty = Math.max(0, item.qty + direction * stepFor(item.unit, item.qty));
    if (nextQty === 0) {
      // Menge auf 0 = Artikel raus, aber über removeItem, damit der Undo-Toast greift
      removeItem(id);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: nextQty } : i)));
    flash(id);
  };

  const setExactQty = (id, qty) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.max(0, qty) } : i)));
  };

  const updateItemMeta = (id, patch) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef(null);

  const saveEditFields = (closeModal) => {
    if (!editItem || !editItem.name.trim()) return;
    // Menge 0 = Artikel soll weg -> über removeItem, damit Undo greift
    if (editItem.qty <= 0) {
      removeItem(editItem.id);
      setEditItem(null);
      return;
    }
    const trimmedName = editItem.name.trim();
    setExactQty(editItem.id, editItem.qty);
    updateItemMeta(editItem.id, { name: trimmedName, mhd: editItem.mhd || null });
    setJustSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (closeModal) {
      savedTimerRef.current = setTimeout(() => { setEditItem(null); setJustSaved(false); }, 320);
    } else {
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 1200);
    }
  };

  const removeItem = (id) => {
    const removed = items.find((i) => i.id === id);
    if (!removed) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    // Automatisch auf die Einkaufsliste, Duplikate (gleicher Name + Zone) vermeiden
    setShopping((prev) => {
      const exists = prev.some(
        (s) => s.zone === removed.zone && s.name.toLowerCase() === removed.name.toLowerCase()
      );
      if (exists) return prev;
      return [...prev, { ...removed, addedAt: Date.now() }];
    });
    setDeletedItem(removed);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setDeletedItem(null), 5000);
  };

  const undoDelete = () => {
    if (!deletedItem) return;
    setItems((prev) => [...prev, deletedItem]);
    // War nur ein Versehen -> auch wieder von der Einkaufsliste runter
    setShopping((prev) => prev.filter((s) => s.id !== deletedItem.id));
    setDeletedItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  // Artikel von der Einkaufsliste zurück in den Bestand (eingekauft)
  const restoreFromShopping = (entry) => {
    setShopping((prev) => prev.filter((s) => s.id !== entry.id));
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.zone === entry.zone && i.name.toLowerCase() === entry.name.toLowerCase()
      );
      // Falls der Artikel inzwischen wieder existiert: Menge addieren statt Dublette anlegen
      if (idx >= 0 && prev[idx].unit === entry.unit) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + (entry.qty > 0 ? entry.qty : 1) };
        return next;
      }
      const { addedAt, ...item } = entry;
      return [...prev, { ...item, qty: entry.qty > 0 ? entry.qty : 1 }];
    });
    setActiveZone(entry.zone);
  };

  const removeFromShopping = (id) => {
    setShopping((prev) => prev.filter((s) => s.id !== id));
  };

  const addItem = () => {
    if (!newItem.name.trim()) return;
    const id = 'i' + Date.now();
    const name = newItem.name.trim();
    setItems((prev) => [
      ...prev,
      { id, zone: activeZone, category: newItem.category, name, qty: newItem.qty, unit: newItem.unit, mhd: newItem.mhd || null },
    ]);
    // Falls der Artikel auf der Einkaufsliste stand: dort raus, er ist ja wieder da
    setShopping((prev) =>
      prev.filter((s) => !(s.zone === activeZone && s.name.toLowerCase() === name.toLowerCase()))
    );
    setNewItem({ name: '', category: CATEGORIES[0], qty: 1, unit: 'stk', mhd: null });
    setShowAdd(false);
  };

  const totalInZone = grouped.reduce((sum, [, list]) => sum + list.length, 0);
  const totalAll = items ? items.length : 0;

  const expiringSoon = useMemo(() => {
    if (!items) return [];
    return items
      .filter((i) => i.mhd)
      .map((i) => ({ ...i, days: daysUntil(i.mhd) }))
      .filter((i) => i.days <= 1)
      .sort((a, b) => a.days - b.days);
  }, [items]);

  // Timer aufräumen, damit nach Unmount kein setState mehr feuert
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  if (!loaded || items === null || !themeLoaded || !shoppingLoaded || shopping === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg, fontFamily: 'system-ui, sans-serif', color: t.textMuted }}>
        Lade Bestand…
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", paddingBottom: 96 }}>
      {/* Header + Tabs bleiben zusammen oben stehen */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: t.bg }}>
      <div style={{ background: zone.bgActive, padding: '20px 20px 14px', transition: 'background 0.3s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', maxWidth: 480, margin: '0 auto', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.02em', marginBottom: 2 }}>
              VORRATS-TRACKER
            </div>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 700, color: t.headerText, letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
            }}>
              <span>{zone.emoji}</span>
              <span>{zone.label}</span>
            </h1>
            <div style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{totalInZone}</span>
              <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 5 }}>Artikel</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowExport(true)}
                style={{
                  background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10,
                  padding: '7px 12px', color: t.headerText, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Export
              </button>
              <button
                onClick={() => setShowImport(true)}
                style={{
                  background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10,
                  padding: '7px 12px', color: t.headerText, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Import
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setShowShopping(true)}
                aria-label="Einkaufsliste öffnen"
                style={{
                  background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10,
                  padding: '6px 10px', color: t.headerText, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5, position: 'relative',
                }}
              >
                <ShoppingCart size={15} strokeWidth={2.2} />
                {shopping && shopping.length > 0 && (
                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>{shopping.length}</span>
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Einstellungen öffnen"
                style={{
                  background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10,
                  padding: '6px 10px', color: t.headerText, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                ⚙️
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Zone tabs */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '10px 20px 10px', display: 'flex', gap: 8 }}>
        {ZONES.map((z) => {
          const active = z.id === activeZone;
          const count = items.filter((i) => i.zone === z.id).length;
          return (
            <button
              key={z.id}
              onClick={() => setActiveZone(z.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '10px 6px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: active ? t.card : 'transparent',
                boxShadow: active ? (dark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)') : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 18 }}>{z.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? (dark ? z.colorDark : z.color) : t.textFaint }}>
                {z.label}
              </span>
              <span style={{ fontSize: 9, color: active ? (dark ? z.colorDark : z.color) : t.textFaint, fontWeight: 500 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
      </div>

      {/* Bald ablaufend Banner */}
      {expiringSoon.length > 0 && (
        <div style={{ maxWidth: 480, margin: '14px auto 0', padding: '0 20px' }}>
          <button
            onClick={() => setActiveZone(expiringSoon[0].zone)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 12,
              padding: '11px 14px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <AlertTriangle size={16} color={t.danger} strokeWidth={2} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: t.danger, lineHeight: 1.4 }}>
              <strong>{expiringSoon.length} Artikel</strong> {expiringSoon.length === 1 ? 'läuft' : 'laufen'} bald ab:{' '}
              {expiringSoon.slice(0, 3).map((i) => `${i.name} (${mhdLabel(i.days)})`).join(', ')}
              {expiringSoon.length > 3 ? `, +${expiringSoon.length - 3} weitere` : ''}
            </span>
          </button>
        </div>
      )}

      {/* Suche */}
      <div style={{ maxWidth: 480, margin: '14px auto 0', padding: '0 20px', position: 'relative' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Artikel suchen (alle Zonen)…"
          style={{ ...inputStyle, paddingRight: 38 }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Suche zurücksetzen"
            style={{
              position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)',
              ...btnCircle(t.cardAlt, t.pillInactiveText), width: 24, height: 24,
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 20px 0' }}>
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: t.textFaint }}>
              <Package size={32} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }} />
              <div style={{ fontSize: 14 }}>Nichts gefunden für „{search}"</div>
            </div>
          ) : (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>
                {searchResults.length} {searchResults.length === 1 ? 'Treffer' : 'Treffer'}
              </div>
              <div style={{ background: t.card, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                {searchResults.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    t={t}
                    dark={dark}
                    justChanged={justChanged}
                    onEdit={setEditItem}
                    onChangeQty={changeQty}
                    onRemove={removeItem}
                    showZoneBadge
                    isLast={idx === searchResults.length - 1}
                  />
                ))}
              </div>
            </div>
          )
        ) : (
          <>
            {grouped.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: t.textFaint }}>
                <Package size={32} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }} />
                <div style={{ fontSize: 14 }}>— leer —</div>
              </div>
            )}
            {grouped.map(([cat, list]) => (
              <div key={cat} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2 }}>
                  {cat}
                </div>
                <div style={{ background: t.card, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {list.map((item, idx) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      t={t}
                      dark={dark}
                      justChanged={justChanged}
                      onEdit={setEditItem}
                      onChangeQty={changeQty}
                      onRemove={removeItem}
                      isLast={idx === list.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => setShowAdd(true)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: zone.bgActive,
          color: t.headerText,
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        aria-label="Neuen Artikel hinzufügen"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Add modal */}
      {showAdd && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              maxHeight: '88vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>
                Neuer Artikel · {zone.emoji} {zone.label}
              </h2>
              <button onClick={() => setShowAdd(false)} style={btnCircle(t.cardAlt, t.pillInactiveText)}>
                <X size={16} />
              </button>
            </div>

            <label style={labelStyle}>Name</label>
            <input
              value={newItem.name}
              onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
              placeholder="z.B. Frischmilch"
              style={inputStyle}
            />

            <label style={labelStyle}>Kategorie</label>
            <CategoryPicker
              value={newItem.category}
              onChange={(c) => setNewItem((s) => ({ ...s, category: c }))}
              t={t}
              inputStyle={inputStyle}
            />

            <label style={labelStyle}>Einheit</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {['stk', 'g', 'ml'].map((u) => (
                <button
                  key={u}
                  onClick={() => setNewItem((s) => ({ ...s, unit: u, qty: u === 'stk' ? 1 : 500 }))}
                  style={pillStyle(newItem.unit === u, t)}
                >
                  {u === 'stk' ? 'Stück' : u}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Menge</label>
            {newItem.unit === 'stk' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button
                  onClick={() => setNewItem((s) => ({ ...s, qty: Math.max(1, s.qty - 1) }))}
                  style={btnCircle(t.cardAlt, t.pillInactiveText)}
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: 'center', color: t.text }}>{newItem.qty}x</span>
                <button
                  onClick={() => setNewItem((s) => ({ ...s, qty: s.qty + 1 }))}
                  style={btnCircle(dark ? zone.bgDark : zone.bg, dark ? zone.colorDark : zone.color)}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <input
                  type="number"
                  value={newItem.qty}
                  onChange={(e) => setNewItem((s) => ({ ...s, qty: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  style={{ ...inputStyle, marginTop: 0 }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textMuted }}>{newItem.unit}</span>
              </div>
            )}

            <label style={labelStyle}>Haltbar bis (optional)</label>
            <input
              type="date"
              value={newItem.mhd || ''}
              onChange={(e) => setNewItem((s) => ({ ...s, mhd: e.target.value || null }))}
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <button
              onClick={addItem}
              disabled={!newItem.name.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: newItem.name.trim() ? zone.bgActive : t.border,
                color: newItem.name.trim() ? t.headerText : t.textFaint, fontSize: 15, fontWeight: 700, cursor: newItem.name.trim() ? 'pointer' : 'default',
              }}
            >
              Hinzufügen
            </button>
          </div>
        </div>
      )}

      {/* Einkaufsliste modal */}
      {showShopping && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setShowShopping(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>
                Einkaufsliste{shopping.length > 0 ? ` · ${shopping.length}` : ''}
              </h2>
              <button onClick={() => setShowShopping(false)} style={btnCircle(t.cardAlt, t.pillInactiveText)}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: t.textFaint, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
              Aufgebrauchte und gelöschte Artikel landen hier automatisch. Antippen legt sie mit der
              alten Zone, Kategorie und Menge zurück in den Bestand.
            </p>

            {shopping.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: t.textFaint }}>
                <ShoppingCart size={30} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.6 }} />
                <div style={{ fontSize: 13.5 }}>Nichts aufgebraucht — Liste ist leer.</div>
              </div>
            ) : (
              <>
                <div style={{ background: t.inputBg, borderRadius: 12, overflow: 'hidden', border: `1px solid ${t.border}` }}>
                  {[...shopping]
                    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
                    .map((entry, idx, arr) => {
                      const z = ZONES.find((zz) => zz.id === entry.zone) || ZONES[0];
                      const accent = dark ? z.colorDark : z.color;
                      return (
                        <div
                          key={entry.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 14px', gap: 10,
                            borderBottom: idx < arr.length - 1 ? `1px solid ${t.border}` : 'none',
                          }}
                        >
                          <button
                            onClick={() => restoreFromShopping(entry)}
                            style={{
                              flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                              border: 'none', cursor: 'pointer', padding: 0,
                            }}
                            aria-label={`${entry.name} zurück in den Bestand legen`}
                          >
                            <div style={{ fontSize: 14.5, color: t.text, fontWeight: 500 }}>{entry.name}</div>
                            <div style={{ fontSize: 10.5, color: accent, fontWeight: 600, marginTop: 2 }}>
                              {z.emoji} {z.label} · {entry.category} ·{' '}
                              {entry.unit === 'stk' ? `${entry.qty > 0 ? entry.qty : 1}x` : `${entry.qty > 0 ? entry.qty : 1}${entry.unit}`}
                            </div>
                          </button>
                          <button
                            onClick={() => restoreFromShopping(entry)}
                            style={{
                              ...btnCircle(dark ? z.bgDark : z.bg, accent),
                              width: 32, height: 32,
                            }}
                            aria-label={`${entry.name} eingekauft`}
                          >
                            <Plus size={15} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => removeFromShopping(entry.id)}
                            style={btnCircle('transparent', t.textFaint)}
                            aria-label={`${entry.name} von der Liste streichen`}
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      );
                    })}
                </div>
                <button
                  onClick={() => setShopping([])}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: 'none', marginTop: 12,
                    background: 'transparent', color: t.danger, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Liste leeren
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setShowSettings(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>Einstellungen</h2>
              <button onClick={() => setShowSettings(false)} style={btnCircle(t.cardAlt, t.pillInactiveText)}>
                <X size={16} />
              </button>
            </div>

            <label style={labelStyle}>Design</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {[
                { value: null, label: 'System', icon: '⚙️' },
                { value: 'light', label: 'Hell', icon: '☀️' },
                { value: 'dark', label: 'Dunkel', icon: '🌙' },
              ].map((opt) => {
                const active = themeOverride === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => setThemeOverride(opt.value)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '11px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: active ? t.text : t.cardAlt,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{opt.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? t.btnPrimaryText : t.pillInactiveText }}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: t.textFaint, marginTop: 8, marginBottom: 0 }}>
              „System" folgt automatisch der Geräteeinstellung. „Hell"/„Dunkel" erzwingen das jeweilige Design dauerhaft.
            </p>
          </div>
        </div>
      )}

      {/* Export modal */}
      {showExport && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setShowExport(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>Bestand exportieren</h2>
              <button onClick={() => setShowExport(false)} style={btnCircle(t.cardAlt, t.pillInactiveText)}>
                <X size={16} />
              </button>
            </div>

            <label style={labelStyle}>Zonen (mehrere möglich)</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {ZONES.map((z) => {
                const active = exportZones.includes(z.id);
                return (
                  <button
                    key={z.id}
                    onClick={() => toggleExportZone(z.id)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '11px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: active ? (dark ? z.bgDark : z.bgActive) : t.cardAlt,
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{z.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? (dark ? z.colorDark : t.headerText) : t.pillInactiveText }}>
                      {z.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                onClick={() => setExportZones(['K', 'F', 'V', 'S'])}
                style={{
                  flex: 1, padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.border}`,
                  background: t.card, color: t.pillInactiveText, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Alle
              </button>
              <button
                onClick={() => setExportZones([])}
                style={{
                  flex: 1, padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.border}`,
                  background: t.card, color: t.pillInactiveText, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Keine
              </button>
            </div>

            <pre
              onClick={(e) => {
                const range = document.createRange();
                range.selectNodeContents(e.currentTarget);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
              }}
              style={{
                background: t.inputBg, border: `1px solid ${t.border}`, borderRadius: 10,
                padding: 12, fontSize: 11, fontFamily: 'monospace', overflowX: 'auto',
                maxHeight: 260, marginBottom: 14, whiteSpace: 'pre', color: t.text, cursor: 'text',
              }}
            >
              {buildExportText(exportZones)}
            </pre>

            <button
              onClick={copyExport}
              disabled={exportZones.length === 0}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: exportZones.length === 0 ? t.border : exportCopyFailed ? t.danger : exportCopied ? t.success : t.text,
                color: t.btnPrimaryText, fontSize: 15, fontWeight: 700, cursor: exportZones.length === 0 ? 'default' : 'pointer',
              }}
            >
              {exportCopyFailed ? 'Kopieren fehlgeschlagen — Text oben markieren' : exportCopied ? 'Kopiert ✓' : 'In Zwischenablage kopieren'}
            </button>
            {exportCopyFailed && (
              <p style={{ fontSize: 11.5, color: t.danger, marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                Automatisches Kopieren nicht möglich in dieser Ansicht. Text im Kasten oben antippen, alles markieren und manuell kopieren.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setShowImport(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.text }}>Bestand importieren</h2>
              <button onClick={() => setShowImport(false)} style={btnCircle(t.cardAlt, t.pillInactiveText)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
              Text mit Zonen-Überschrift (KÜHLSCHRANK / GEFRIERFACH / VORRAT / SNACKS) und Zeilen
              „Kategorie | Artikel | Menge" einfügen — z.B. direkt aus einem Chat-Export oder EXPORT-Codeblock kopiert.
              Optional eine 4. Spalte „JJJJ-MM-TT" für das Haltbarkeitsdatum ergänzen (funktioniert in jeder Zone).
            </p>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'KÜHLSCHRANK\nMilchprodukte | Frischmilch | 1x | 2026-07-20\nGemüse | Brokkoli | 1x\n\nVORRAT\nKonserven | Gebackene Bohnen | 2x'}
              rows={8}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 8, margin: '12px 0 4px' }}>
              <button
                onClick={() => setImportMode('merge')}
                style={pillStyle(importMode === 'merge', t)}
              >
                Zusammenführen
              </button>
              <button
                onClick={() => setImportMode('replace')}
                style={pillStyle(importMode === 'replace', t)}
              >
                Komplett ersetzen
              </button>
            </div>
            <p style={{ fontSize: 11, color: t.textFaint, marginTop: 4, marginBottom: 16 }}>
              {importMode === 'merge'
                ? 'Gleiche Artikel (Name + Zone) werden in der Menge addiert, neue Artikel ergänzt.'
                : 'Löscht den kompletten aktuellen Bestand und ersetzt ihn vollständig durch den importierten Text.'}
            </p>

            {importError && (
              <div style={{ background: t.dangerBg, color: t.danger, fontSize: 12.5, padding: '10px 12px', borderRadius: 10, marginBottom: 14 }}>
                {importError}
              </div>
            )}

            <button
              onClick={runImport}
              disabled={!importText.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: importText.trim() ? t.text : t.border,
                color: t.btnPrimaryText, fontSize: 15, fontWeight: 700, cursor: importText.trim() ? 'pointer' : 'default',
              }}
            >
              Importieren
            </button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <div
          style={{
            position: 'fixed', inset: 0, background: t.overlay,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 20,
          }}
          onClick={() => setEditItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.card, borderRadius: '20px 20px 0 0', padding: '20px 20px 28px',
              width: '100%', maxWidth: 480, boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              maxHeight: '88vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ ...labelStyle, marginTop: 0 }}>Name</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={editItem.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditItem((s) => ({ ...s, name: val }));
                    }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 16, fontWeight: 600, flex: 1 }}
                  />
                  <button
                    onClick={() => saveEditFields(false)}
                    disabled={!editItem.name.trim()}
                    aria-label="Speichern, ohne zu schließen"
                    style={{
                      ...btnCircle(justSaved ? t.success : (editItem.name.trim() ? t.text : t.border), t.btnPrimaryText),
                      width: 40, height: 40, fontSize: 16, fontWeight: 700, flexShrink: 0,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    ✓
                  </button>
                </div>
              </div>
              <button onClick={() => setEditItem(null)} style={{ ...btnCircle(t.cardAlt, t.pillInactiveText), marginTop: 20 }}>
                <X size={16} />
              </button>
            </div>

            <label style={labelStyle}>Zone</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {ZONES.map((z) => {
                const active = editItem.zone === z.id;
                return (
                  <button
                    key={z.id}
                    onClick={() => {
                      updateItemMeta(editItem.id, { zone: z.id });
                      setEditItem((s) => ({ ...s, zone: z.id }));
                    }}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '11px 4px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: active ? z.bgActive : t.cardAlt,
                    }}
                    aria-label={`Nach ${z.label} verschieben`}
                  >
                    <span style={{ fontSize: 18 }}>{z.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: active ? t.headerText : t.pillInactiveText }}>
                      {z.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: t.textFaint, marginTop: 4, marginBottom: 4 }}>
              Aktuell: {ZONES.find((z) => z.id === editItem.zone)?.label}
            </p>

            <label style={labelStyle}>Kategorie</label>
            <CategoryPicker
              value={editItem.category}
              onChange={(c) => {
                updateItemMeta(editItem.id, { category: c });
                setEditItem((s) => ({ ...s, category: c }));
              }}
              t={t}
              inputStyle={inputStyle}
            />

            <label style={labelStyle}>Einheit</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {['stk', 'g', 'ml'].map((u) => (
                <button
                  key={u}
                  onClick={() => {
                    const newQty = u === 'stk' ? 1 : editItem.unit === 'stk' ? 500 : editItem.qty;
                    updateItemMeta(editItem.id, { unit: u, qty: newQty });
                    setEditItem((s) => ({ ...s, unit: u, qty: newQty }));
                  }}
                  style={pillStyle(editItem.unit === u, t)}
                >
                  {u === 'stk' ? 'Stück' : u}
                </button>
              ))}
            </div>

            <label style={labelStyle}>{editItem.unit === 'stk' ? 'Menge' : 'Menge exakt setzen'}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="number"
                value={editItem.qty}
                onChange={(e) => setEditItem((s) => ({ ...s, qty: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                style={{ ...inputStyle, marginTop: 0 }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: t.textMuted, minWidth: 24 }}>
                {editItem.unit === 'stk' ? 'x' : editItem.unit}
              </span>
            </div>

            {editItem.unit !== 'stk' && (
              <p style={{ fontSize: 11.5, color: t.textFaint, marginTop: 0, marginBottom: 16 }}>
                Tipp: zum Abbuchen z.B. bei 500g Reis und 200g verbraucht → hier 300 eintragen.
              </p>
            )}

            <label style={labelStyle}>Haltbar bis (optional)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="date"
                value={editItem.mhd || ''}
                onChange={(e) => setEditItem((s) => ({ ...s, mhd: e.target.value || null }))}
                style={{ ...inputStyle, marginTop: 0 }}
              />
              {editItem.mhd && (
                <button
                  onClick={() => setEditItem((s) => ({ ...s, mhd: null }))}
                  style={btnCircle(t.cardAlt, t.pillInactiveText)}
                  aria-label="Haltbarkeitsdatum entfernen"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => saveEditFields(true)}
              disabled={!editItem.name.trim()}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                background: justSaved ? t.success : (editItem.name.trim() ? t.text : t.border),
                color: t.btnPrimaryText, fontSize: 15, fontWeight: 700,
                cursor: editItem.name.trim() ? 'pointer' : 'default', marginBottom: 10,
                transition: 'background 0.15s ease',
              }}
            >
              {justSaved ? 'Gespeichert ✓' : 'Speichern'}
            </button>
            <button
              onClick={() => { removeItem(editItem.id); setEditItem(null); }}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                background: 'transparent', color: t.danger, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Artikel entfernen
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: t.textFaint, marginTop: 8 }}>
        {totalAll} Artikel insgesamt
      </div>

      {/* Rückgängig-Toast nach Löschen */}
      {deletedItem && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: 20, right: 20, maxWidth: 440, margin: '0 auto',
            background: t.text, color: t.bg, borderRadius: 14, padding: '13px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)', zIndex: 30,
          }}
        >
          <span style={{ fontSize: 13.5 }}>„{deletedItem.name}" gelöscht</span>
          <button
            onClick={undoDelete}
            style={{
              background: 'none', border: 'none', color: t.bg, fontSize: 13.5, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0, textDecoration: 'underline',
            }}
          >
            Rückgängig
          </button>
        </div>
      )}
    </div>
  );
}

function btnCircle(bg, color) {
  return {
    width: 28, height: 28, borderRadius: '50%', border: 'none', background: bg, color,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  };
}

function pillStyle(active, t) {
  return {
    flex: 1, padding: '9px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
    fontSize: 12.5, fontWeight: 600,
    background: active ? t.pillActive : t.pillInactive,
    color: active ? t.pillActiveText : t.pillInactiveText,
  };
}

function makeLabelStyle(t) {
  return { display: 'block', fontSize: 11, fontWeight: 700, color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, marginTop: 14 };
}
function makeInputStyle(t, dark) {
  return {
    width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${t.border}`,
    fontSize: 15, color: t.text, boxSizing: 'border-box', background: t.inputBg,
    colorScheme: dark ? 'dark' : 'light',
  };
}