// auth.js – Authentication functionality for MedSwipe
// ----------------------------------------------------

// --- Import necessary functions directly from firebase-config ---
import {
  auth,                     // Firebase Auth instance
  db,                       // Firestore instance
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  onAuthStateChanged,
  createUserWithEmailAndPassword, // For direct registration
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updateProfile,
  // --- Added for linkWithCredential ---
  EmailAuthProvider,
  linkWithCredential,
  updateDoc // Make sure updateDoc is here if you use it
  // --- End added ---
} from './firebase-config.js';

// ----------------------------------------------------
// Global reference to the auth state listener
let authStateListener = null;

// Auth state management
window.authState = {
  user: null,
  isRegistered: false,
  isLoading: true,
  accessTier: "free_guest", // <<< ADD a default accessTier
  boardReviewActive: false, // <<< ADD
  boardReviewSubscriptionEndDate: null, // <<< ADD
  cmeSubscriptionActive: false, // <<< ADD
  cmeSubscriptionEndDate: null, // <<< ADD
  cmeCreditsAvailable: 0 // <<< ADD
};

// ----------------------------------------------------
// Helper: generate a guest-style username
function generateGuestUsername() {
  const adjectives = ['Curious', 'Medical', 'Swift', 'Learning', 'Aspiring'];
  const nouns      = ['Learner', 'Student', 'User', 'Doctor', 'Practitioner'];
  const adj  = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num  = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}${noun}${num}`;
}

// ----------------------------------------------------
// Initialize authentication system and set up listeners
function initAuth() {
  if (!auth || !db) {
    console.error('Firebase auth or db instance not available. Retrying…');
    setTimeout(initAuth, 500);
    return;
  }

  console.log('Initializing auth system');

  authStateListener = onAuthStateChanged(auth, async (user) => {
    console.log(
      'Auth state changed:',
      user ? `${user.uid} (isAnonymous: ${user?.isAnonymous})` : 'No user'
    );

    // Reset authState for new evaluation
    window.authState.isLoading = true;
    window.authState.user = null;
    window.authState.isRegistered = false;
    window.authState.accessTier = "free_guest"; // Default tier
    window.authState.boardReviewActive = false;
    window.authState.boardReviewSubscriptionEndDate = null;
    window.authState.cmeSubscriptionActive = false;
    window.authState.cmeSubscriptionEndDate = null;
    window.authState.cmeCreditsAvailable = 0;


    if (user) {
      // ---------- Signed-in path ----------
      window.authState.user = user; // Set Firebase user object

      const userDocRef = doc(db, 'users', user.uid);
      let userDocSnap;
      try {
        userDocSnap = await getDoc(userDocRef);
      } catch (docError) {
        console.error(`Error fetching user document for ${user.uid}:`, docError);
        window.authState.isLoading = false;
        window.dispatchEvent(
          new CustomEvent('authStateChanged', { detail: { ...window.authState } })
        );
        return;
      }
      
      let userDataForWrite = {};
      const isNewUserDocument = !userDocSnap.exists();
      const currentAuthIsRegistered = !user.isAnonymous;

      let effectiveAccessTier = "free_guest";

      if (isNewUserDocument) {
        console.log(`User doc for ${user.uid} not found, creating with defaults...`);
        userDataForWrite = {
          username: user.isAnonymous
            ? generateGuestUsername()
            : (user.displayName || user.email || `User_${user.uid.substring(0, 5)}`),
          email: user.email || null,
          createdAt: serverTimestamp(),
          isRegistered: currentAuthIsRegistered,
          accessTier: "free_guest", 
          specialty: "ENT", 
          experienceLevel: null, 
          stats: {
            totalAnswered: 0,
            totalCorrect:  0,
            totalIncorrect: 0,
            categories: {},
            totalTimeSpent: 0,
            xp: 0,
            level: 1,
            achievements: {},
            currentCorrectStreak: 0
          },
          streaks: {
            lastAnsweredDate: null,
            currentStreak: 0,
            longestStreak: 0
          },
          bookmarks: [],
          answeredQuestions: {}, // Initialize answeredQuestions for new users
          cmeStats: {
            totalAnswered: 0,
            totalCorrect:  0,
            eligibleAnswerCount: 0,
            creditsEarned:  0.0,
            creditsClaimed: 0.0
          },
          cmeAnsweredQuestions: {},
          cmeClaimHistory: [],
          boardReviewActive: false,
          boardReviewSubscriptionEndDate: null,
          cmeSubscriptionActive: false,
          cmeSubscriptionEndDate: null,
          cmeCreditsAvailable: 0,
          // marketingOptIn: false, // This was added in later suggestions
          // mailerLiteSubscriberId: null, // This was added in later suggestions
        };

        if (currentAuthIsRegistered && user.email) {
          userDataForWrite.email = user.email;
        }
        window.authState.isRegistered = currentAuthIsRegistered;
        window.authState.accessTier = "free_guest";
      } else {
        // ---- Existing Firestore user doc ----
        const existingData = userDocSnap.data();
        console.log(
          `Found user doc for ${user.uid}. AuthIsAnon=${user.isAnonymous}, StoredIsReg=${existingData.isRegistered}, StoredTier=${existingData.accessTier}`
        );

        if (existingData.isRegistered !== currentAuthIsRegistered) {
          console.log(`Correcting isRegistered for ${user.uid} in Firestore.`);
          userDataForWrite.isRegistered = currentAuthIsRegistered;
        }
        window.authState.isRegistered = currentAuthIsRegistered;

        if (currentAuthIsRegistered && user.email && existingData.email !== user.email) {
          userDataForWrite.email = user.email;
        }

        if (
          user.isAnonymous &&
          (!existingData.username ||
            !/^((Curious|Medical|Swift|Learning|Aspiring)(Learner|Student|User|Doctor|Practitioner))/.test(
              existingData.username
            ))
        ) {
          userDataForWrite.username = generateGuestUsername();
        }

         if (typeof existingData.specialty === 'undefined' || existingData.specialty === null || existingData.specialty === "") {
          console.log(`User ${user.uid} is missing specialty. Back-filling with 'ENT'.`);
          userDataForWrite.specialty = "ENT";
        }
        
        // Initialize potentially missing structures on older documents
        // This was a good safeguard from later suggestions, you might want to keep it or ensure your old docs are fine.
        if (!existingData.stats) userDataForWrite.stats = { xp: 0, level: 1, totalAnswered: 0, totalCorrect: 0, /* etc. */ };
        if (!existingData.answeredQuestions) userDataForWrite.answeredQuestions = {};
        if (!existingData.bookmarks) userDataForWrite.bookmarks = [];
        if (!existingData.cmeStats) userDataForWrite.cmeStats = { creditsEarned: 0, creditsClaimed: 0, totalAnswered: 0, totalCorrect: 0, /* etc. */ };


        let brActive = existingData.boardReviewActive || false;
        let brEndDate = existingData.boardReviewSubscriptionEndDate || null;
        let cmeActive = existingData.cmeSubscriptionActive || false;
        let cmeEndDate = existingData.cmeSubscriptionEndDate || null;
        const credits = existingData.cmeCreditsAvailable || 0;
        let storedTier = existingData.accessTier || "free_guest";

        const now = new Date();

        if (brActive && brEndDate && brEndDate.toDate() < now) {
          console.log(`Client-side: Board Review for ${user.uid} expired.`);
          brActive = false;
          userDataForWrite.boardReviewActive = false;
        }

        if (cmeActive && cmeEndDate && cmeEndDate.toDate() < now) {
          console.log(`Client-side: CME Annual for ${user.uid} expired.`);
          cmeActive = false;
          userDataForWrite.cmeSubscriptionActive = false;
          if (existingData.boardReviewTier === "Granted by CME Annual") {
             userDataForWrite.boardReviewActive = false;
          }
        }
        
        if (cmeActive) {
            effectiveAccessTier = "cme_annual";
        } else if (brActive) {
            effectiveAccessTier = "board_review";
        } else if (credits > 0) {
            effectiveAccessTier = "cme_credits_only";
        } else {
            effectiveAccessTier = "free_guest";
        }

        if (effectiveAccessTier !== storedTier) {
            console.log(`Client-side tier re-evaluation for ${user.uid}: Stored='${storedTier}', NewEffective='${effectiveAccessTier}'. Updating Firestore.`);
            userDataForWrite.accessTier = effectiveAccessTier;
        }
        
        window.authState.accessTier = effectiveAccessTier;
        window.authState.boardReviewActive = brActive;
        window.authState.boardReviewSubscriptionEndDate = brEndDate ? brEndDate.toDate() : null;
        window.authState.cmeSubscriptionActive = cmeActive;
        window.authState.cmeSubscriptionEndDate = cmeEndDate ? cmeEndDate.toDate() : null;
        window.authState.cmeCreditsAvailable = credits;
      }

      if (isNewUserDocument || Object.keys(userDataForWrite).length > 0) {
        if (!isNewUserDocument && Object.keys(userDataForWrite).length > 0) {
            userDataForWrite.updatedAt = serverTimestamp();
        }
        try {
          // Using { merge: true } is generally safe and good practice.
          await setDoc(userDocRef, userDataForWrite, { merge: true });
          console.log(
            `User doc ${isNewUserDocument ? 'created' : 'updated'} for ${user.uid}. Effective Tier: ${window.authState.accessTier}`
          );
        } catch (err) {
          console.error('Error writing user doc:', err);
        }
      } else {
         console.log(`User doc for ${user.uid} exists and is up-to-date. Effective Tier: ${window.authState.accessTier}`);
      }

      // Re-fetch after any potential write to ensure window.authState is based on the latest from DB
      // This was a good addition from later suggestions.
      const finalUserDocSnap = await getDoc(userDocRef);
      if (finalUserDocSnap.exists()) {
          const finalUserData = finalUserDocSnap.data();
          window.authState.isRegistered = finalUserData.isRegistered || false;
          window.authState.accessTier = finalUserData.accessTier || "free_guest";
          window.authState.boardReviewActive = finalUserData.boardReviewActive || false;
          window.authState.boardReviewSubscriptionEndDate = finalUserData.boardReviewSubscriptionEndDate?.toDate() || null;
          window.authState.cmeSubscriptionActive = finalUserData.cmeSubscriptionActive || false;
          window.authState.cmeSubscriptionEndDate = finalUserData.cmeSubscriptionEndDate?.toDate() || null;
          window.authState.cmeCreditsAvailable = finalUserData.cmeCreditsAvailable || 0;
      }


    } else {
      console.log('No user currently signed in. Preparing for anonymous sign-in or state clear.');
      try {
        await signInAnonymously(auth);
        console.log('Signed in anonymously after explicit logout/no user.');
      } catch (err) {
        console.error('Anonymous sign-in error after explicit logout/no user:', err);
        window.authState.isLoading = false;
        window.dispatchEvent(
          new CustomEvent('authStateChanged', { detail: { ...window.authState } })
        );
      }
      return; 
    }

    if (window.authState.user || !user) { 
        window.authState.isLoading = false;
    }

    console.log("Dispatching authStateChanged with detail:", {
        user: window.authState.user,
        isRegistered: window.authState.isRegistered,
        isLoading: window.authState.isLoading,
        accessTier: window.authState.accessTier,
        boardReviewActive: window.authState.boardReviewActive,
        boardReviewSubscriptionEndDate: window.authState.boardReviewSubscriptionEndDate,
        cmeSubscriptionActive: window.authState.cmeSubscriptionActive,
        cmeSubscriptionEndDate: window.authState.cmeSubscriptionEndDate,
        cmeCreditsAvailable: window.authState.cmeCreditsAvailable
    });

    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: {
          user: window.authState.user,
          isRegistered: window.authState.isRegistered,
          isLoading: window.authState.isLoading,
          accessTier: window.authState.accessTier,
          boardReviewActive: window.authState.boardReviewActive,
          boardReviewSubscriptionEndDate: window.authState.boardReviewSubscriptionEndDate,
          cmeSubscriptionActive: window.authState.cmeSubscriptionActive,
          cmeSubscriptionEndDate: window.authState.cmeSubscriptionEndDate,
          cmeCreditsAvailable: window.authState.cmeCreditsAvailable
        }
      })
    );
  }); // End of onAuthStateChanged

  return () => {
    if (authStateListener) {
      console.log('Cleaning up auth state listener.');
      authStateListener();
      authStateListener = null;
    }
  };
} // End of initAuth

// ----------------------------------------------------
// Convenience accessors
function isUserRegistered() {
  return window.authState.isRegistered;
}
function getCurrentUser() {
  return window.authState.user;
}

// ----------------------------------------------------
// Direct email/password registration (not upgrade)
// This version takes marketingOptIn from the form via app.js
async function registerUser(email, password, username, _experienceLevel_not_used, marketingOptInValue) {
  try {
    console.log(`registerUser: creating ${email}`);
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(user, { displayName: username });

    const userDocRef = doc(db, 'users', user.uid);

    // This setDoc will be merged by onAuthStateChanged if it runs after,
    // or it will create the doc if onAuthStateChanged hasn't run yet for this new user.
    // It's important that onAuthStateChanged uses { merge: true } for its setDoc.
    await setDoc(
      userDocRef,
      {
        username,
        email,
        isRegistered: true,
        marketingOptIn: marketingOptInValue, // Set from form
        // Initialize other fields as onAuthStateChanged would for a new user
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        accessTier: "free_guest",
        specialty: "ENT",
        experienceLevel: null,
        stats: { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0, xp: 0, level: 1, achievements: {}, currentCorrectStreak: 0 },
        streaks: { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 },
        bookmarks: [],
        answeredQuestions: {},
        cmeStats: { totalAnswered: 0, totalCorrect: 0, eligibleAnswerCount: 0, creditsEarned: 0.0, creditsClaimed: 0.0 },
        cmeAnsweredQuestions: {},
        cmeClaimHistory: [],
        boardReviewActive: false,
        boardReviewSubscriptionEndDate: null,
        cmeSubscriptionActive: false,
        cmeSubscriptionEndDate: null,
        cmeCreditsAvailable: 0,
        // mailerLiteSubscriberId: null, // This was added in later suggestions
      },
      { merge: true } // Use merge: true here as well
    );

    // onAuthStateChanged will handle updating window.authState and dispatching the event
    // No need to manually set window.authState here as onAuthStateChanged will run.

    return user;
  } catch (err) {
    console.error('registerUser error:', err);
    throw err;
  }
}

// ----------------------------------------------------
// Upgrade currently anonymous user to permanent account
// This version takes marketingOptIn from the form via app.js
async function upgradeAnonymousUser(email, password, username, _experienceLevel_not_used, marketingOptInValue) {
  const anonUser = auth.currentUser;

  if (!anonUser || !anonUser.isAnonymous) {
    throw new Error('No anonymous user to upgrade.');
  }

  console.log(`Linking anonymous UID ${anonUser.uid} to ${email}…`);

  try {
    const cred = EmailAuthProvider.credential(email, password);
    const { user: upgradedUser } = await linkWithCredential(anonUser, cred);

    await updateProfile(upgradedUser, { displayName: username });

    const userDocRef = doc(db, 'users', upgradedUser.uid);
    // ONLY update fields that change due to registration.
    // Let onAuthStateChanged handle the full state update and ensure other data is preserved.
    await updateDoc( // Using updateDoc is appropriate here as the doc for anon user should exist
      userDocRef,
      {
        username,
        email,
        isRegistered: true,
        marketingOptIn: marketingOptInValue, // Set from form
        updatedAt: serverTimestamp()
        // DO NOT touch stats, answeredQuestions, etc. here.
      }
    );

    // onAuthStateChanged will handle updating window.authState and dispatching the event
    // for the newly registered (non-anonymous) user.

    return upgradedUser;
  } catch (err) {
    console.error('upgradeAnonymousUser error:', err);
    throw err;
  }
}

// ----------------------------------------------------
// Login / logout helpers
async function loginUser(email, password) {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return user; // onAuthStateChanged will handle the rest
  } catch (err) {
    console.error('loginUser error:', err);
    throw err;
  }
}

async function logoutUser() {
  try {
    // cleanupOnLogout might be defined in app.js or user.v2.js
    if (typeof window.cleanupOnLogout === 'function') { // Check if it's on window
        await window.cleanupOnLogout();
    } else if (typeof cleanupOnLogout === 'function') { // Check if it's in scope (less likely for module)
        await cleanupOnLogout();
    }
    await signOut(auth);
    console.log('Logged out – anonymous sign-in will run via onAuthStateChanged.');
    // onAuthStateChanged will handle signing in anonymously and updating UI
  } catch (err) {
    console.error('logoutUser error:', err);
    throw err;
  }
}

// ----------------------------------------------------
// Expose functions globally if needed by UI scripts
window.authFunctions = {
  isUserRegistered,
  getCurrentUser,
  registerUser,
  loginUser,
  logoutUser,
  upgradeAnonymousUser
};

// Kick things off
initAuth();
