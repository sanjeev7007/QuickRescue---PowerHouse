import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyQuickRescueEmergency2026KeyDemo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "quickrescue-sih2026.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "quickrescue-sih2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "quickrescue-sih2026.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "103961626223",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:103961626223:web:qr26bhim99"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
  console.info("🛡️ [FIREBASE] Firestore initialized with multi-tab IndexedDB offline persistence.");
} catch (err) {

  console.warn("⚠️ [FIREBASE] Reusing existing Firestore instance:", err.message);
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;
export default app;
