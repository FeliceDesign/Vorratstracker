// Ersetzt window.storage (nur in Claude-Artifacts verfügbar) durch echtes
// persistentes localStorage, mit demselben Rückgabeformat { key, value }.
// So bleibt der komplette App-Code unverändert - er "denkt", er redet
// weiterhin mit window.storage.

if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      if (value === null) return null;
      return { key, value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    async list(prefix = '') {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
      return { keys };
    },
  };
}
