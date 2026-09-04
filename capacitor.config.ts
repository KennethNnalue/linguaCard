import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const developmentServerUrl = process.env['CAPACITOR_DEV_SERVER_URL'];

const config: CapacitorConfig = {
  appId: 'app.linguacard',
  appName: 'LinguaCard',
  webDir: 'www',
  ...(developmentServerUrl
    ? {
        server: {
          url: developmentServerUrl,
          cleartext: true,
        },
      }
    : {}),
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Ionic,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
