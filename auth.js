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
} from './firebase-config.js';

window.authState = {
user: null,
isRegistered: false,
isLoading: true
};

let authStateListener = null;

// --- Helper function for a small delay ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function initAuth() {
if (!auth || !db) {
  console.error("Firebase auth or db instance not available. Retrying...");
  setTimeout(initAuth, 500);
  return;
}
console.log("Initializing auth system");

authStateListener = onAuthStateChanged(auth, async (user) => {
  console.log("Auth state changed:", user ? user.uid : 'No user');
  window.authState.isLoading = true;

  if (user) {
    window.authState.user = user;
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
            isRegistered: !user.isAnonymous,
            stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
            streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
            bookmarks: [],
            cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
            cmeAnsweredQuestions: {},
            cmeClaimHistory: []
        };
    } else {
        const existingData = userDocSnap.data();
        console.log(`User document for ${user.uid} found by onAuthStateChanged. Current isAnonymous: ${user.isAnonymous}, Stored isRegistered: ${existingData.isRegistered}`);
        if (existingData.isRegistered !== !user.isAnonymous) {
            console.log(`Correcting isRegistered flag for user ${user.uid} from ${existingData.isRegistered} to ${!user.isAnonymous}.`);
            userDataForWrite.isRegistered = !user.isAnonymous;
        }
        if (user.isAnonymous && (!existingData.username || (!existingData.username.startsWith("Curious") && !existingData.username.startsWith("Guest") && !existingData.username.startsWith("Medical") && !existingData.username.startsWith("Swift") && !existingData.username.startsWith("Learning") && !existingData.username.startsWith("Aspiring")))) {
            console.log(`User ${user.uid} is anonymous and existing username "${existingData.username}" is not guest-like. Setting to guest name.`);
            userDataForWrite.username = generateGuestUsername();
        }
    }

    if (isNewUserDocument || Object.keys(userDataForWrite).length > 0) {
        // --- ADDED DELAY for new, non-anonymous users ---
        if (isNewUserDocument && !user.isAnonymous) {
            console.log(`Delaying Firestore write for new registered user ${user.uid} in onAuthStateChanged by 300ms`);
            await sleep(300); // Small delay
        }
        // --- END ADDED DELAY ---
        try {
            await setDoc(userDocRef, userDataForWrite, { merge: true });
            console.log(`User document for ${user.uid} ${isNewUserDocument ? 'created' : 'updated'} successfully by onAuthStateChanged.`);
        } catch (error) {
            console.error(`Error ${isNewUserDocument ? 'creating' : 'updating'} user document for ${user.uid} in onAuthStateChanged:`, error);
        }
    }
    window.authState.isRegistered = !user.isAnonymous;

  } else {
    window.authState.user = null;
    window.authState.isRegistered = false;
    console.log("No user signed in. Attempting anonymous sign-in...");
    try {
      await signInAnonymously(auth);
      console.log("Signed in anonymously.");
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

  // --- ADDED DELAY ---
  console.log(`Delaying Firestore write in registerUser for ${user.uid} by 300ms`);
  await sleep(300);
  // --- END ADDED DELAY ---

  await setDoc(userDocRef, {
    username: username,
    email: email,
    experience: experience,
    isRegistered: true,
    updatedAt: serverTimestamp()
  }, { merge: true });
  console.log(`Registered user ${user.uid} and updated Firestore with registration details.`);

  window.authState.user = user;
  window.authState.isRegistered = true;
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
  const newRegisteredUserData = {
      stats: originalUserData.stats || { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
      streaks: originalUserData.streaks || { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
      bookmarks: originalUserData.bookmarks || [],
      cmeStats: originalUserData.cmeStats || { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.00, creditsClaimed: 0.00 },
      cmeAnsweredQuestions: originalUserData.cmeAnsweredQuestions || {},
      cmeClaimHistory: originalUserData.cmeClaimHistory || [],
      username: username,
      email: email,
      experience: experience,
      isRegistered: true,
      updatedAt: serverTimestamp(),
      previousAnonymousUid: anonymousUid,
  };
  if (originalUserData.createdAt) {
    newRegisteredUserData.createdAt = originalUserData.createdAt;
  }

  // --- ADDED DELAY ---
  console.log(`Delaying Firestore write in upgradeAnonymousUser for ${newUser.uid} by 300ms`);
  await sleep(300);
  // --- END ADDED DELAY ---

  await setDoc(newUserDocRef, newRegisteredUserData, { merge: true });
  console.log(`Copied data and updated document for new user ${newUser.uid} with registration details.`);

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