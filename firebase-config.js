// Firebase App, Analytics, Firestore, Auth & App Check (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAnalytics, logEvent, setUserProperties } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-analytics.js";
import { getFirestore, doc, runTransaction, getDoc, addDoc, collection, serverTimestamp, getDocs, setDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, updateProfile, sendPasswordResetEmail, getIdToken, EmailAuthProvider, linkWithCredential } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-functions.js";
// Add App Check imports
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app-check.js";

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
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const functionsInstance = getFunctions(app);

// Initialize App Check
let appCheck = null;

// Function to initialize App Check for production
function initializeAppCheckForEnvironment() {
  try {
    const hostname = window.location.hostname;
    
    if (hostname === 'medswipeapp.com') {
      // TEMPORARY: Enable debug mode to bypass reCAPTCHA issues while troubleshooting
      if (typeof self !== 'undefined') {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      
      // Production environment
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider('6Ld2rk8rAAAAAG4CK6ZdeKZASBvvYoYmfj0107Ag'),
        isTokenAutoRefreshEnabled: true
      });
      console.log('App Check initialized for production (debug mode temporarily enabled)');
    } else {
      console.log('App Check not initialized - only enabled for production domain');
    }
  } catch (error) {
    console.error('App Check initialization failed:', error);
    // Continue without App Check if initialization fails
  }
}

// Initialize App Check
initializeAppCheckForEnvironment();

console.log("Firebase initialized successfully");
console.log("Firebase Functions Client SDK initialized");

// Helper function to get App Check token (useful for debugging)
async function getAppCheckToken() {
  if (!appCheck) {
    console.warn('App Check not initialized');
    return null;
  }
  
  try {
    const token = await getToken(appCheck);
    console.log('App Check token retrieved successfully');
    return token;
  } catch (error) {
    console.error('Failed to get App Check token:', error);
    return null;
  }
}

// Export initialized services for other modules to import
export { 
  app, 
  analytics, 
  db, 
  auth, 
  functionsInstance as functions,
  appCheck, // Export App Check instance
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
  where,
  getAppCheckToken // Export helper function
};