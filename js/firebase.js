import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBhIIJTXoyI9ZowslTRGN5IDQ5qTgeuf1M",
  authDomain: "fitness-challenge-6061e.firebaseapp.com",
  projectId: "fitness-challenge-6061e",
  storageBucket: "fitness-challenge-6061e.firebasestorage.app",
  messagingSenderId: "623386176896",
  appId: "1:623386176896:web:e621094ad6359da608a565",
  measurementId: "G-GN16VR5B3B"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  collection,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc
};
