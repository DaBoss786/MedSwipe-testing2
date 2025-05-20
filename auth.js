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

    // --- MODIFIED SECTION: Streamlined Document Creation/Update in onAuthStateChanged ---
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    let userDataForWrite = {};
    let isNewUserDocument = !userDocSnap.exists();

    if (isNewUserDocument) {
        console.log(`User document for ${user.uid} not found by onAuthStateChanged, preparing to create...`);
        userDataForWrite = {
            username: user.isAnonymous ? generateGuestUsername() : (user.displayName || user.email || `User_${user.uid.substring(0,5)}`),
            email: user.email || null,
            createdAt: serverTimestamp(),
            isRegistered: !user.isAnonymous, // Set based on current auth type
            // Initialize all default structures
            stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
            streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
            bookmarks: [],
            cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
            cmeAnsweredQuestions: {},
            cmeClaimHistory: []
            // 'experience' will be added by registerUser or upgradeAnonymousUser
        };
    } else {
        // Document exists, check if isRegistered flag needs correction based on current auth state
        const existingData = userDocSnap.data();
        console.log(`User document for ${user.uid} found by onAuthStateChanged. Current isAnonymous: ${user.isAnonymous}, Stored isRegistered: ${existingData.isRegistered}`);
        if (existingData.isRegistered !== !user.isAnonymous) {
            console.log(`Correcting isRegistered flag for user ${user.uid} from ${existingData.isRegistered} to ${!user.isAnonymous}.`);
            userDataForWrite.isRegistered = !user.isAnonymous;
        }
        // If it's an anonymous user signing in and the doc exists, ensure username is guest-like if not set or not already guest-like
        if (user.isAnonymous && (!existingData.username || (!existingData.username.startsWith("Curious") && !existingData.username.startsWith("Guest") && !existingData.username.startsWith("Medical") && !existingData.username.startsWith("Swift") && !existingData.username.startsWith("Learning") && !existingData.username.startsWith("Aspiring")))) {
            console.log(`User ${user.uid} is anonymous and existing username "${existingData.username}" is not guest-like. Setting to guest name.`);
            userDataForWrite.username = generateGuestUsername();
        }
    }

    // Perform the write operation if it's a new document or if there are fields to update
    if (isNewUserDocument || Object.keys(userDataForWrite).length > 0) {
        try {
            await setDoc(userDocRef, userDataForWrite, { merge: true }); // Always merge
            console.log(`User document for ${user.uid} ${isNewUserDocument ? 'created' : 'updated'} successfully by onAuthStateChanged.`);
        } catch (error) {
            console.error(`Error ${isNewUserDocument ? 'creating' : 'updating'} user document for ${user.uid} in onAuthStateChanged:`, error);
        }
    }
    // --- END MODIFIED SECTION ---

    // Update local authState.isRegistered based on the definitive source (user.isAnonymous)
    // This ensures window.authState.isRegistered is correct even before Firestore write completes or if it fails.
    window.authState.isRegistered = !user.isAnonymous;


  } else {
    // No user is signed in, reset auth state
    window.authState.user = null;
    window.authState.isRegistered = false;
    console.log("No user signed in. Attempting anonymous sign-in...");

    // Automatically sign in anonymously
    try {
      await signInAnonymously(auth);
      console.log("Signed in anonymously.");
      // The onAuthStateChanged listener will trigger again for the new anonymous user
    } catch (error) {
      console.error("Error signing in anonymously:", error);
      window.authState.isLoading = false;
    }
  }

  if (window.authState.user || !user) {
       window.authState.isLoading = false;
  }

  window.dispatchEvent(new CustomEvent('authStateChanged', {
    detail: {
        user: window.authState.user,
        isRegistered: window.authState.isRegistered,
        isLoading: window.authState.isLoading
     }
  }));
  console.log("Dispatched authStateChanged event:", window.authState);
});

return () => {
  if (authStateListener) {
    console.log("Cleaning up auth state listener.");
    authStateListener();
    authStateListener = null;
  }
};
}

function isUserRegistered() {
return window.authState.isRegistered;
}

function getCurrentUser() {
return window.authState.user;
}

async function registerUser(email, password, username, experience) {
try {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await updateProfile(user, { displayName: username });

  const userDocRef = doc(db, 'users', user.uid);
  // --- MODIFIED SECTION: Simplified write in registerUser ---
  // onAuthStateChanged will handle the creation of the basic document structure.
  // This function now focuses on adding/merging registration-specific details.
  await setDoc(userDocRef, {
    username: username,
    email: email,
    experience: experience,
    isRegistered: true, // Explicitly mark as registered
    updatedAt: serverTimestamp()
    // Basic stats, streaks, bookmarks, cmeStats are initialized by onAuthStateChanged
  }, { merge: true }); // Merge is crucial here
  // --- END MODIFIED SECTION ---

  console.log(`Registered user ${user.uid} and updated Firestore with registration details.`);

  // Update local state immediately as onAuthStateChanged might have a slight delay
  // or might have already run for the new user before this setDoc completes.
  window.authState.user = user;
  window.authState.isRegistered = true; // Ensure local state reflects registration
  window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { ...window.authState, isRegistered: true } }));

  return user;
} catch (error) {
  console.error("Error registering user:", error);
  throw error;
}
}

async function loginUser(email, password) {
try {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
} catch (error) {
  console.error("Error logging in:", error);
  throw error;
}
}

async function logoutUser() {
try {
  if (typeof cleanupOnLogout === 'function') {
      await cleanupOnLogout();
  } else {
      console.warn("cleanupOnLogout function not found during logout.");
  }
  await signOut(auth);
  console.log("User logged out successfully. Anonymous sign-in will be attempted.");
} catch (error) {
  console.error("Error signing out:", error);
  throw error;
}
}

async function upgradeAnonymousUser(email, password, username, experience) {
const currentUser = auth.currentUser;

if (!currentUser || !currentUser.isAnonymous) {
  throw new Error("No anonymous user is currently signed in to upgrade.");
}
const anonymousUid = currentUser.uid;
console.log(`Attempting to upgrade anonymous user: ${anonymousUid}`);

let originalUserData = {};

try {
  const userDocRef = doc(db, 'users', anonymousUid);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    originalUserData = userDocSnap.data();
    console.log("Fetched data for anonymous user to carry over.");
  } else {
     console.warn("No existing document found for anonymous user during upgrade, will start fresh for new user.");
     // Initialize default data if needed, though onAuthStateChanged should handle this for the new user
      originalUserData = {
          stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
          streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
          bookmarks: [],
          cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
          cmeAnsweredQuestions: {},
          cmeClaimHistory: []
      };
  }

  console.log("Signing out anonymous user before upgrade...");
  await signOut(auth);
  console.log("Anonymous user signed out.");

  console.log("Creating new registered account...");
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const newUser = userCredential.user;
  console.log(`New registered user created: ${newUser.uid}`);

  await updateProfile(newUser, { displayName: username });
  console.log("Updated profile for new user.");

  const newUserDocRef = doc(db, 'users', newUser.uid);
  // --- MODIFIED SECTION: Simplified write in upgradeAnonymousUser ---
  // onAuthStateChanged will handle the creation of the basic document structure for newUser.
  // This function now focuses on merging registration-specific details and carrying over old data.
  const newRegisteredUserData = {
      // Carry over essential data from the anonymous profile
      stats: originalUserData.stats || { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
      streaks: originalUserData.streaks || { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
      bookmarks: originalUserData.bookmarks || [],
      cmeStats: originalUserData.cmeStats || { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
      cmeAnsweredQuestions: originalUserData.cmeAnsweredQuestions || {},
      cmeClaimHistory: originalUserData.cmeClaimHistory || [],
      // Add new registration details
      username: username,
      email: email,
      experience: experience,
      isRegistered: true,     // CRITICAL: Mark as registered
      updatedAt: serverTimestamp(),
      previousAnonymousUid: anonymousUid,
      // Let createdAt be handled by onAuthStateChanged if it's a truly new doc for newUser,
      // or if originalUserData.createdAt existed, it's already in ...originalUserData.
  };
  if (originalUserData.createdAt) { // Explicitly preserve if it existed
    newRegisteredUserData.createdAt = originalUserData.createdAt;
  }

  await setDoc(newUserDocRef, newRegisteredUserData, { merge: true }); // Merge is crucial
  // --- END MODIFIED SECTION ---
  console.log(`Copied data and updated document for new user ${newUser.uid} with registration details.`);

  // Update local state immediately
  window.authState.user = newUser;
  window.authState.isRegistered = true;
  window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { ...window.authState, isRegistered: true } }));


  return newUser;

} catch (error) {
  console.error("Error upgrading anonymous user:", error);
  console.log("Upgrade failed, attempting to sign back in anonymously...");
  try {
    await signInAnonymously(auth);
  } catch (signInError) {
    console.error("Failed to sign back in anonymously after upgrade error:", signInError);
  }
  throw error;
}
}

function generateGuestUsername() {
const adjectives = ["Curious", "Medical", "Swift", "Learning", "Aspiring"];
const nouns = ["Learner", "Student", "User", "Doctor", "Practitioner"];
const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
const noun = nouns[Math.floor(Math.random() * nouns.length)];
const num = Math.floor(Math.random() * 9000) + 1000;
return `${adj}${noun}${num}`;
}

window.authFunctions = {
isUserRegistered,
getCurrentUser,
registerUser,
loginUser,
logoutUser,
upgradeAnonymousUser
};

initAuth();