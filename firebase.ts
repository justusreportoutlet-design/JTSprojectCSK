// firebase.ts - VERSI IRIT christian-project-3cf5c
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  memoryLocalCache
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDRb6zMxT9YvBs0ogDupOzaqT4XuqOc-Qk",
  authDomain: "christian-project-3cf5c.firebaseapp.com",
  projectId: "christian-project-3cf5c",
  storageBucket: "christian-project-3cf5c.firebasestorage.app",
  messagingSenderId: "997954373115",
  appId: "1:997954373115:web:7a6d5a6f7e8d9c0b1a2e3f"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// VERSI IRIT 1000 BROWSER - pakai persistent cache IndexedDB multi-tab
let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED
    })
  });
} catch {
  try {
    firestoreDb = getFirestore(app);
  } catch {
    firestoreDb = initializeFirestore(app, {
      localCache: memoryLocalCache()
    });
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);
export { app };
export default app;