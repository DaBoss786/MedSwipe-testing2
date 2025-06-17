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

function waitForRecaptcha() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait
    
    function checkRecaptcha() {
      attempts++;
      console.log(`Checking for ReCAPTCHA... attempt ${attempts}`);
      
      // Check for ReCAPTCHA Enterprise specifically
      if (window.grecaptcha && window.grecaptcha.enterprise) {
        console.log("ReCAPTCHA Enterprise object found!");
        // Enterprise doesn't use .ready(), it's immediately available
        resolve();
      } else if (window.grecaptcha && window.grecaptcha.ready) {
        // Fallback for regular ReCAPTCHA
        window.grecaptcha.ready(() => {
          console.log("ReCAPTCHA is ready!");
          resolve();
        });
      } else if (attempts < maxAttempts) {
        setTimeout(checkRecaptcha, 100);
      } else {
        // Let's see what we actually have
        console.log("ReCAPTCHA check failed. window.grecaptcha:", window.grecaptcha);
        if (window.grecaptcha) {
          console.log("Available methods:", Object.keys(window.grecaptcha));
        }
        reject(new Error("ReCAPTCHA failed to load after 5 seconds"));
      }
    }
    
    checkRecaptcha();
  });
}

// Initialize App Check after reCAPTCHA is ready
waitForRecaptcha()
  .then(() => {
    console.log("Starting App Check initialization...");
    
    try {
      const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider("6Ld2rk8rAAAAAG4cK6ZdeKzASBvvVoYmfj0107Ag"),
        isTokenAutoRefreshEnabled: true
      });
      
      console.log("App Check initialized successfully!");
      
      // Force get a token to verify it's working
      return appCheck.getToken(true);
    } catch (error) {
      console.error("Error during App Check initialization:", error);
      throw error;
    }
  })
  .then((tokenResponse) => {
    console.log("App Check token obtained:", tokenResponse.token ? "SUCCESS" : "FAILED");
  })
  .catch((error) => {
    console.error("Failed to initialize App Check:", error);
    alert("App Check initialization failed. Some features may not work properly.");
  });

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
