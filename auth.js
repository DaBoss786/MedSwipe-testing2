// auth.js - Authentication functionality for MedSwipe

// --- Import necessary functions directly from firebase-config ---
import {
  auth, // Firebase Auth instance
  db,   // Firestore instance
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updateProfile
  // Note: sendPasswordResetEmail is not used in this file, so not imported here
} from './firebase-config.js'; // Adjust path if needed (e.g., '../firebase-config.js')

// --- Import helper functions if they are defined elsewhere (e.g., app.js or utils.js) ---
// Make sure cleanupOnLogout is defined and accessible, or import it if it's in another module.
// If it's in app.js and not exported, you might need to move it to utils.js and export/import it.
// For now, assuming it might be globally available or needs to be imported:
// import { cleanupOnLogout } from './app.js'; // Example path

// Global reference to the auth state listener
let authStateListener = null;

// Auth state management - accessible throughout the app via window.authState
// We keep this on window for now as other modules might rely on it directly.
// A better long-term solution might be a dedicated state management module.
window.authState = {
user: null,
isRegistered: false,
isLoading: true
};

/**
* Initialize authentication system and set up listeners
* This should be called once when the app starts
*/
function initAuth() {
// Use the imported auth and db variables directly
if (!auth || !db) {
  console.error("Firebase auth or db instance not available from import. Check firebase-config.js. Retrying...");
  setTimeout(initAuth, 500);
  return;
}

console.log("Initializing auth system (using imported services)");

// Set up auth state listener using imported functions
authStateListener = onAuthStateChanged(auth, async (user) => {
  console.log("Auth state changed:", user ? user.uid : 'No user');
  window.authState.isLoading = true; // Set loading true while processing

  if (user) {
    // User is signed in
    window.authState.user = user; // Store user object

    // Check if this is a registered user or anonymous guest
    const userDocRef = doc(db, 'users', user.uid); // Use imported doc and db
    const userDocSnap = await getDoc(userDocRef); // Use imported getDoc
    const isRegistered = userDocSnap.exists() && userDocSnap.data().isRegistered === true;
    window.authState.isRegistered = isRegistered;

    // Create user document if it doesn't exist (for anonymous or first-time registered)
    if (!userDocSnap.exists()) {
      console.log(`User document for ${user.uid} not found, creating...`);
      try {
        await setDoc(userDocRef, { // Use imported setDoc
          username: user.isAnonymous ? generateGuestUsername() : (user.displayName || user.email || `User_${user.uid.substring(0,5)}`), // Generate guest name or use profile
          email: user.email || null, // Store email if available
          createdAt: serverTimestamp(), // Use imported serverTimestamp
          isRegistered: !user.isAnonymous, // Set based on auth type
          // Initialize stats for new users
          stats: {
            totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {},
            totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0
          },
          // Initialize other fields if needed
          streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
          bookmarks: [],
          cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
          cmeAnsweredQuestions: {},
          cmeClaimHistory: []
        });
        console.log(`Created initial user document for ${user.uid}`);
      } catch (error) {
         console.error(`Error creating user document for ${user.uid}:`, error);
      }
    } else {
       console.log(`User document found for ${user.uid}. Registered: ${isRegistered}`);
    }

  } else {
    // No user is signed in, reset auth state
    window.authState.user = null;
    window.authState.isRegistered = false;
    console.log("No user signed in. Attempting anonymous sign-in...");

    // Automatically sign in anonymously
    try {
      // Use imported signInAnonymously and auth
      await signInAnonymously(auth);
      console.log("Signed in anonymously.");
      // The onAuthStateChanged listener will trigger again for the new anonymous user
    } catch (error) {
      console.error("Error signing in anonymously:", error);
      // Handle failure to sign in anonymously (app might not work correctly)
      window.authState.isLoading = false; // Ensure loading state is updated even on error
    }
  }

  // Only set loading to false *after* processing or anonymous sign-in attempt
  if (window.authState.user || !user) { // Avoid setting false if anonymous sign-in failed and retrying
       window.authState.isLoading = false;
  }


  // Dispatch an event that components can listen for
  // Ensure detail contains the latest state
  window.dispatchEvent(new CustomEvent('authStateChanged', {
    detail: {
        user: window.authState.user,
        isRegistered: window.authState.isRegistered,
        isLoading: window.authState.isLoading
     }
  }));
  console.log("Dispatched authStateChanged event:", window.authState);
});

// Return cleanup function
return () => {
  if (authStateListener) {
    console.log("Cleaning up auth state listener.");
    authStateListener(); // Unsubscribe
    authStateListener = null;
  }
};
}

/**
* Check if the current user is registered (not anonymous)
* @returns {boolean} True if user is registered, false if guest
*/
function isUserRegistered() {
// Keep using window.authState for now, assuming it's the central state
return window.authState.isRegistered;
}

/**
* Get the current user object
* @returns {Object|null} The current user or null if not signed in
*/
function getCurrentUser() {
// Keep using window.authState
return window.authState.user;
}

/**
* Register a new user with email and password
* @param {string} email - User's email
* @param {string} password - User's password
* @param {string} username - User's display name
* @param {string} experience - User's experience level
* @returns {Promise<Object>} The newly created user
*/
async function registerUser(email, password, username, experience) {
// Use imported auth, db, etc. directly
try {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await updateProfile(user, { displayName: username });

  const userDocRef = doc(db, 'users', user.uid);
  // No need to get existing data here, as onAuthStateChanged will handle doc creation/update
  // Just ensure the registration flag and profile details are set correctly.
  await setDoc(userDocRef, {
    username: username,
    email: email,
    experience: experience,
    isRegistered: true, // Mark as registered
    updatedAt: serverTimestamp(),
    // Ensure basic stats/fields exist if created here instead of listener
    stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
    streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
    bookmarks: [],
    cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
    cmeAnsweredQuestions: {},
    cmeClaimHistory: []
  }, { merge: true }); // Merge ensures we don't overwrite createdAt if listener already ran

  // Update local state immediately (listener might take a moment)
  window.authState.user = user;
  window.authState.isRegistered = true;
   window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { ...window.authState } }));


  return user;
} catch (error) {
  console.error("Error registering user:", error);
  throw error; // Re-throw for calling function to handle
}
}

/**
* Log in a user with email and password
* @param {string} email - User's email
* @param {string} password - User's password
* @returns {Promise<Object>} The logged in user
*/
async function loginUser(email, password) {
// Use imported auth directly
try {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  // onAuthStateChanged listener will handle updating window.authState
  return userCredential.user;
} catch (error) {
  console.error("Error logging in:", error);
  throw error;
}
}

/**
* Log out the current user
* @returns {Promise<void>}
*/
async function logoutUser() {
// Use imported auth directly
try {
  // Call cleanup function first (ensure it's accessible)
  if (typeof cleanupOnLogout === 'function') {
      await cleanupOnLogout();
  } else {
      console.warn("cleanupOnLogout function not found during logout.");
      // Add manual cleanup here if needed as fallback
  }

  await signOut(auth);
  // onAuthStateChanged listener will handle anonymous sign-in and state update
  console.log("User logged out successfully. Anonymous sign-in will be attempted.");
} catch (error) {
  console.error("Error signing out:", error);
  throw error;
}
}

/**
* Convert an anonymous account to a registered account
* NOTE: This simplified version creates a NEW account and attempts to copy data.
* A production app should use linkWithCredential for a seamless upgrade.
* @param {string} email - User's email
* @param {string} password - User's password
* @param {string} username - User's display name
* @param {string} experience - User's experience level
* @returns {Promise<Object>} The upgraded user
*/
async function upgradeAnonymousUser(email, password, username, experience) {
// Use imported auth, db, etc.
const currentUser = auth.currentUser; // Get current user via imported auth

if (!currentUser || !currentUser.isAnonymous) {
  throw new Error("No anonymous user is currently signed in to upgrade.");
}
const anonymousUid = currentUser.uid;
console.log(`Attempting to upgrade anonymous user: ${anonymousUid}`);

let originalUserData = {}; // To store data before sign-out

try {
  // 1. Get existing anonymous user data
  const userDocRef = doc(db, 'users', anonymousUid);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    originalUserData = userDocSnap.data();
    console.log("Fetched data for anonymous user.");
  } else {
     console.warn("No existing document found for anonymous user, starting fresh.");
     // Initialize default data if needed, similar to registerUser
      originalUserData = {
          stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
          streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
          bookmarks: [],
          cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
          cmeAnsweredQuestions: {},
          cmeClaimHistory: []
      };
  }

  // 2. Sign out anonymous user (important before creating new account)
  console.log("Signing out anonymous user before upgrade...");
  await signOut(auth);
  console.log("Anonymous user signed out.");

  // 3. Create new registered user account
  console.log("Creating new registered account...");
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const newUser = userCredential.user;
  console.log(`New registered user created: ${newUser.uid}`);

  // 4. Update new user's profile
  await updateProfile(newUser, { displayName: username });
  console.log("Updated profile for new user.");

  // 5. Create/Update Firestore document for the NEW user, copying old data
  const newUserDocRef = doc(db, 'users', newUser.uid);
  await setDoc(newUserDocRef, {
    ...originalUserData, // Copy stats, streaks, bookmarks, cme data etc.
    username: username,
    email: email,
    experience: experience,
    isRegistered: true, // Mark as registered
    createdAt: originalUserData.createdAt || serverTimestamp(), // Keep original creation time if possible
    updatedAt: serverTimestamp(), // Set update time
    previousAnonymousUid: anonymousUid // Link to old anonymous ID for tracking
  });
  console.log(`Copied data and created document for new user ${newUser.uid}`);

  // The onAuthStateChanged listener will fire for the new user and update window.authState

  return newUser; // Return the newly created registered user

} catch (error) {
  console.error("Error upgrading anonymous user:", error);
  // Attempt to sign back in anonymously if upgrade failed badly
  console.log("Upgrade failed, attempting to sign back in anonymously...");
  try {
    await signInAnonymously(auth);
  } catch (signInError) {
    console.error("Failed to sign back in anonymously after upgrade error:", signInError);
  }
  throw error; // Re-throw the original upgrade error
}
}

/**
* Generate a random guest username
* @returns {string} A guest username
*/
function generateGuestUsername() {
const adjectives = ["Curious", "Medical", "Swift", "Learning", "Aspiring"];
const nouns = ["Learner", "Student", "User", "Doctor", "Practitioner"];
const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
const noun = nouns[Math.floor(Math.random() * nouns.length)];
const num = Math.floor(Math.random() * 9000) + 1000;
return `${adj}${noun}${num}`;
}

// --- Keep authFunctions on window for now if other modules rely on it ---
// Long term, other modules should import these functions if needed.
window.authFunctions = {
isUserRegistered,
getCurrentUser,
registerUser,
loginUser,
logoutUser,
upgradeAnonymousUser
};

// --- Initialize auth system when the script loads ---
initAuth();

// --- Export functions if needed by other modules using import ---
// Example: export { initAuth, isUserRegistered, getCurrentUser, ... };
// For now, relying on window.authFunctions and window.authState
