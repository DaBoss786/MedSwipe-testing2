// Firebase App, Analytics, Firestore & Auth (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-analytics.js";
import { getFirestore, doc, runTransaction, getDoc, addDoc, collection, serverTimestamp, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, signOut, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA24Xgt6ZF9pR7AMc235H2UeK044QhR3ts",
  authDomain: "medswipe-648ee.firebaseapp.com",
  projectId: "medswipe-648ee",
  storageBucket: "medswipe-648ee.appspot.com",
  messagingSenderId: "288366122490",
  appId: "1:288366122490:web:1c150c48c8aed4e27f0043",
  measurementId: "G-748P8P634B"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

console.log("Firebase initialized successfully");

// Make Firestore functions globally available
window.analytics = analytics;
window.logEvent = logEvent;
window.db = db;
window.auth = auth;
window.doc = doc;
window.runTransaction = runTransaction;
window.getDoc = getDoc;
window.addDoc = addDoc;
window.collection = collection;
window.serverTimestamp = serverTimestamp;
window.getDocs = getDocs;
window.setDoc = setDoc;

// Export Firebase auth methods for auth.js
window.onAuthStateChanged = onAuthStateChanged;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.signInAnonymously = signInAnonymously;
window.signOut = signOut;
window.updateProfile = updateProfile;
window.sendPasswordResetEmail = sendPasswordResetEmail;

// Once Firebase is fully initialized, initialize the auth module
document.addEventListener('DOMContentLoaded', function() {
  // Make sure auth.js has loaded
  setTimeout(function() {
    if (window.initAuthModule) {
      console.log("Initializing auth module");
      window.initAuthModule();
    } else {
      console.error("Auth module not loaded yet");
    }
  }, 500);
});
