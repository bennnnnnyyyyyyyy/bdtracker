import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyBWbj2YcFcBwuAkR4JdWUTu0dEYb4uQgoE",
  authDomain: "tribal-quest-484611-j3.firebaseapp.com",
  projectId: "tribal-quest-484611-j3",
  storageBucket: "tribal-quest-484611-j3.firebasestorage.app",
  messagingSenderId: "81250650490",
  appId: "1:81250650490:web:edf7b2b8837d7c14666ec3",
  measurementId: "G-SQPBLDYJJD"
};

// Initialize Firebase (singleton pattern for Next.js)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
