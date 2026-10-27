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
  messagingSenderId: "701163493761",
  appId: "1:701163493761:web:83e345b69404d9bf87de972",
  measurementId: "G-7K9YKDSMQB"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let firestoreDb: any;

try {
  firestoreDb = getFirestore(app);
} catch {
  // Not initialized yet
}

if (!firestoreDb) {
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
      try {
        firestoreDb = initializeFirestore(app, {
          localCache: memoryLocalCache()
        });
      } catch {
        firestoreDb = getFirestore(app);
      }
    }
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);
export { app };