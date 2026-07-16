import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.felicedesign.vorratstracker',
  appName: 'Vorrats-Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
