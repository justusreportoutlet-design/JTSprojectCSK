import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  browserLocalPersistence, 
  indexedDBLocalPersistence, 
  inMemoryPersistence,
  browserPopupRedirectResolver,
  initializeAuth
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, memoryLocalCache, setLogLevel, getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import appletConfig from './firebase-applet-config.json';

// Suppress Firestore verbose SDK logs to keep console clean
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyD_LsdvEVnPwy9ApljoqGkAx2qFXc2VXiU",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "cskprojectreport.firebaseapp.com",
  databaseURL: (import.meta.env as any).VITE_FIREBASE_DATABASE_URL || (appletConfig as any).databaseURL || "https://cskprojectreport-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "cskprojectreport",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "cskprojectreport.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "772239435792",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || "1:772239435792:web:6283d60fb8a0702e918295",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || (appletConfig as any).measurementId || "G-XS5GGQ7ER7"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Analytics is optional; avoid eager getAnalytics to prevent installations API 400 errors when API key restrictions apply
let analytics: any = null;

/**
 * Check if storage is actually available. 
 * In some restricted iframes (Safari), just accessing localStorage or indexedDB throws "The operation is insecure".
 */
const isStorageAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    const storage = (window as any)['localStorage'];
    if (!storage) return false;
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const isIndexedDBAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    const idb = (window as any)['indexedDB'];
    return !!idb;
  } catch {
    return false;
  }
};

// Initialize Auth with multiple persistence strategies to prevent crashes in restricted iframes
const persistenceChoices = [];
if (isStorageAvailable()) {
  persistenceChoices.push(browserLocalPersistence);
}
if (isIndexedDBAvailable()) {
  persistenceChoices.push(indexedDBLocalPersistence);
}
persistenceChoices.push(inMemoryPersistence);

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: persistenceChoices,
    popupRedirectResolver: typeof window !== 'undefined' ? browserPopupRedirectResolver : undefined
  });
} catch {
  try {
    authInstance = getAuth(app);
  } catch {
    authInstance = {} as any;
  }
}

export const auth = authInstance;

// Firestore with persistent cache and memory fallback
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: isIndexedDBAvailable() ? persistentLocalCache() : memoryLocalCache(),
    experimentalForceLongPolling: true
  });
} catch {
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }
}

export const db = firestoreInstance;

// Realtime Database instance
let rtdbInstance: any = null;
try {
  rtdbInstance = getDatabase(app);
} catch (e) {
  console.warn("RTDB initialization error:", e);
}
export const rtdb = rtdbInstance;

export const storage = getStorage(app);
export { app, analytics };
export default app;
