import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDrQFlKywMohd3Xb_C-sognUOPLfFhczd4",
  authDomain: "christian-project-3cf5c.firebaseapp.com",
  projectId: "christian-project-3cf5c",
  storageBucket: "christian-project-3cf5c.firebasestorage.app",
  messagingSenderId: "997954373115",
  appId: "1:997954373115:web:7a6d5a6f7e8d9c0b1a2e3f"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// IRIT 1000 BROWSER: baca dari cache HP dulu
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch(() => {});
}