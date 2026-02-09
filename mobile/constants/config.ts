import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Use Expo's debuggerHost to automatically detect the dev machine's IP
// This works for physical devices, simulators, and emulators
const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
const hostIp = debuggerHost?.split(':')[0] ?? 'localhost';

const LOCAL_API = `http://${hostIp}:3000`;

const AZURE_API = 'https://retailfixit-api.azurewebsites.net';

// Toggle this when you want to test against Azure
const USE_AZURE = false;

/** API configuration with auto-detected base URL */
export const config = {
  apiBaseUrl: USE_AZURE ? AZURE_API : LOCAL_API,
} as const;
