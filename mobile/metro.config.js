const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

function readNativeSocialFlag() {
  if (process.env.EXPO_PUBLIC_NATIVE_SOCIAL === 'true') return true;
  if (process.env.EXPO_PUBLIC_NATIVE_SOCIAL === 'false') return false;
  try {
    const envPath = path.join(__dirname, '.env');
    const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('EXPO_PUBLIC_NATIVE_SOCIAL='));
    return line?.split('=')[1]?.trim() === 'true';
  } catch {
    return false;
  }
}

const nativeSocialEnabled = readNativeSocialFlag();
const config = getDefaultConfig(__dirname);

const NATIVE_ONLY_MODULES = new Set([
  '@react-native-google-signin/google-signin',
  '@react-native-seoul/kakao-login',
]);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (!nativeSocialEnabled && NATIVE_ONLY_MODULES.has(moduleName)) {
    return { type: 'empty' };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
