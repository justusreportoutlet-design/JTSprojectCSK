// firebase.ts - VERSI IRIT christian-project-3cf5c
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence, browserPopupRedirectResolver, initializeAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, setLogLevel, getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import appletConfig from './firebase-applet-config.json';

try { setLogLevel('silent'); } catch {}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyDRb6zMxT9YvBs0ogDupOzaqT4XuqOc-Qk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "christian-project-3cf5c.firebaseapp.com",
  databaseURL: (import.meta.env as any).VITE_FIREBASE_DATABASE_URL || (appletConfig as any).databaseURL || "https://christian-project-3cf5c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "christian-project-3cf5c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "christian-project-3cf5c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "701163493751",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || "1:701163493751:web:83e345b694049db5fde972",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const analytics: any = null;

// --- Auth tetep sama biar ga crash di iframe ---
const isStorageAvailable = () => {
  try {
    if (typeof window === 'undefined') return false;
    const storage = (window as any)['localStorage'];
    if (!storage) return false;
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch { return false; }
};
const isIndexedDBAvailable = () => {
  try { return typeof window !== 'undefined' && !!(window as any)['indexedDB']; } catch { return false; }
};

const persistenceChoices = [];
if (isStorageAvailable()) persistenceChoices.push(browserLocalPersistence);
if (isIndexedDBAvailable()) persistenceChoices.push(indexedDBLocalPersistence);
persistenceChoices.push(inMemoryPersistence);

let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: persistenceChoices,
    popupRedirectResolver: typeof window !== 'undefined' ? browserPopupRedirectResolver : undefined
  });
} catch { authInstance = getAuth(app); }
export const auth = authInstance;

// --- FIRESTORE VERSI IRIT - GA PAKE PERSISTENT CACHE DULU ---
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache(), // irit, ga nyimpen cache gede di browser
    // HAPUS experimentalForceLongPolling biar ga polling terus
  });
} catch {
  firestoreInstance = getFirestore(app);
}
export const db = firestoreInstance;

// RTDB & Storage lazy aja
export const rtdb = (() => { try { return getDatabase(app); } catch { return null; } })();
export const storage = getStorage(app);

// --- FUNGSI IRIT KHUSUS PROJECT BARU ---
export const getDataIrit = async (collectionName: string) => {
  const q = query(collection(db, collectionName), orderBy("createdAt","desc"), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export { app };
export default app;