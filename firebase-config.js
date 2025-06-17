import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app-check.js";

// Firebase App, Analytics, Firestore & Auth (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAnalytics, logEvent, setUserProperties } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-analytics.js";
import { getFirestore, doc, runTransaction, getDoc, addDoc, collection, serverTimestamp, getDocs, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, updateProfile, sendPasswordResetEmail, getIdToken, EmailAuthProvider, linkWithCredential } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-functions.js"; // Added Functions import

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA24Xgt6ZF9pR7AMc235H2UeK044QhR3ts",
  authDomain: "medswipe-648ee.firebaseapp.com",
  projectId: "medswipe-648ee",
  storageBucket: "medswipe-648ee.firebasestorage.app",
  messagingSenderId: "288366122490",
  appId: "1:288366122490:web:1c150c48c8aed4e27f0043",
  measurementId: "G-748P8P634B"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);

// Add this before initializeAppCheck
function waitForRecaptcha() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    function checkRecaptcha() {
      attempts++;
      if (window.grecaptcha && window.grecaptcha.enterprise) {
        window.grecaptcha.enterprise.ready(() => {
          console.log("ReCAPTCHA Enterprise is ready");
          resolve();
        });
      } else if (attempts < maxAttempts) {
        setTimeout(checkRecaptcha, 100);
      } else {
        reject(new Error("ReCAPTCHA Enterprise failed to load"));
      }
    }
    
    checkRecaptcha();
  });
}

// Initialize App Check after reCAPTCHA is ready
waitForRecaptcha()
  .then(() => {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider("6Ld2rk8rAAAAAG4cK6ZdeKzASBvvVoYmfj0107Ag"),
      isTokenAutoRefreshEnabled: true
    });
    console.log("App Check initialized successfully");
    
    // Force a token fetch to test
    appCheck.getToken(true).then((token) => {
      console.log("App Check token obtained:", token ? "Yes" : "No");
    });
  })
  .catch((error) => {
    console.error("Failed to initialize App Check:", error);
  });

const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const functionsInstance = getFunctions(app); // Renamed to avoid conflicts

console.log("Firebase initialized successfully");
console.log("Firebase Functions Client SDK initialized");

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
