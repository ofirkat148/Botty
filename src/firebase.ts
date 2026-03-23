import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

let dbInstance;
try {
  // Try to use the named database if provided
  if (firebaseConfig.firestoreDatabaseId) {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
} catch (e) {
  console.warn("Failed to initialize Firestore with databaseId, falling back to default", e);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
