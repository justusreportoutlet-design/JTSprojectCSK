import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, memoryLocalCache, getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import appletConfig from "../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyDRb6zMxT9YvBs0ogDupOzaqT4XuqOc-Qk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "christian-project-3cf5c.firebaseapp.com",
  databaseURL: (import.meta.env as any).VITE_FIREBASE_DATABASE_URL || (appletConfig as any).databaseURL || "https://christian-project-3cf5c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "christian-project-3cf5c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "christian-project-3cf5c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "701163493751",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || "1:701163493751:web:83e345b694049db5fde972",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || (appletConfig as any).measurementId || "G-7K9YKDSNQB"
};

const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || (appletConfig as any).firestoreDatabaseId;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let firestoreInstance;
try {
  firestoreInstance = databaseId 
    ? getFirestore(app, databaseId) 
    : initializeFirestore(app, { localCache: persistentLocalCache() });
} catch {
  try {
    firestoreInstance = databaseId 
      ? getFirestore(app, databaseId) 
      : initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch {
    firestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  }
}

export const db = firestoreInstance;
export const auth = getAuth(app);

let rtdbInstance: any = null;
try {
  rtdbInstance = getDatabase(app);
} catch (e) {
  console.warn("RTDB initialization error in lib/firebase:", e);
}
export const rtdb = rtdbInstance;

export const analytics: any = null;
export { app };
export default app;
