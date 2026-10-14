import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, memoryLocalCache, getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
import appletConfig from "../firebase-applet-config.json";

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
