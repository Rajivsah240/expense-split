import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let defaultConfig: Record<string, string> = {};
try {
  // @ts-ignore - optional import when file is ignored by git
  defaultConfig = require('../../firebase-applet-config.json');
} catch {
  defaultConfig = {};
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultConfig.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultConfig.appId || '',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || defaultConfig.firestoreDatabaseId || '',
};

const app = initializeApp(firebaseConfig);
// Firebase's default database is selected by omitting the database ID. Treat an
// explicit "(default)" configuration the same way.
const databaseId = firebaseConfig.firestoreDatabaseId === '(default)'
  ? undefined
  : firebaseConfig.firestoreDatabaseId || undefined;
// Keep recently used data available on a reload when the network is slow or
// temporarily unavailable. Multiple-tab persistence prevents one open tab from
// disabling the cache for the others.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  },
  databaseId
);
export const auth = getAuth(app);
