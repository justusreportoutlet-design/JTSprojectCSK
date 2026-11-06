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
  messagingSenderId: "701163493751",
  appId: "1:701163493751:web:83e345b694049db5fde972",
  measurementId: "G-7K9YKDSNQB"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Explicitly target the "(default)" Firestore database
export const FIRESTORE_DATABASE_ID = "(default)";

let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED
      })
    },
    FIRESTORE_DATABASE_ID
  );
} catch {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache()
      },
      FIRESTORE_DATABASE_ID
    );
  } catch {
    firestoreDb = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);
export { app };