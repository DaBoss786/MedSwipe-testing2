
// Firebase App, Analytics, Firestore & Auth (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAnalytics, logEvent, setUserProperties } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-analytics.js";
import { getFirestore, doc, runTransaction, getDoc, addDoc, collection, serverTimestamp, getDocs, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, updateProfile, sendPasswordResetEmail, getIdToken, EmailAuthProvider, linkWithCredential } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-functions.js"; // Added Functions import

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAK2_9t_toM9HbYhkKBOk25uSzemrWwJIw",
  authDomain: "medswipe-testing.firebaseapp.com",
  projectId: "medswipe-testing",
  storageBucket: "medswipe-testing.firebasestorage.app",
  messagingSenderId: "278044870445",
  appId: "1:278044870445:web:d4d2b39b411bd442aa75a4",
  measurementId: "G-YP85WBMM0S"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const functionsInstance = getFunctions(app); // Renamed to avoid conflicts

console.log("Firebase initialized successfully");
console.log("Firebase Functions Client SDK initialized");
console.log("Checking for ReCAPTCHA:", window.grecaptcha ? "Found" : "Not found");
console.log("Firebase App Check available:", typeof initializeAppCheck !== 'undefined' ? "Yes" : "No");

// Export initialized services for other modules to import
export { 
  app, 
  analytics, 
  db, 
  auth, 
  functionsInstance as functions, // Export as "functions" to match expected naming
  logEvent,
  setUserProperties, 
  doc, 
  runTransaction, 
  getDoc, 
  addDoc, 
  collection, 
  serverTimestamp, 
  getDocs, 
  setDoc, 
  updateDoc,
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  updateProfile, 
  sendPasswordResetEmail, 
  getIdToken,
  httpsCallable,
  EmailAuthProvider,
  linkWithCredential,
  query,
  where
};
