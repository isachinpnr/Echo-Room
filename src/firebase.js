import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCHWXmhql3iZWIluOCDPj5BiXPng3uRyK8",
  authDomain: "echo-room-bf3f6.firebaseapp.com",
  projectId: "echo-room-bf3f6",
  storageBucket: "echo-room-bf3f6.firebasestorage.app",
  messagingSenderId: "442478074011",
  appId: "1:442478074011:web:49cfaf03265f8897998e3e",
  measurementId: "G-BYS99LYXFM"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  console.error('Persistence error:', err.code);
});