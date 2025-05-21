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
  linkWithCredential
  // --- End added ---
} from './firebase-config.js';

// ----------------------------------------------------
// Global reference to the auth state listener
let authStateListener = null;

// Auth state management
window.authState = {
  user: null,
  isRegistered: false,
  isLoading: true
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

    window.authState.isLoading = true;

    if (user) {
      // ---------- Signed-in path ----------
      window.authState.user = user;

      const userDocRef  = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      let   userDataForWrite    = {};
      const isNewUserDocument   = !userDocSnap.exists();
      const currentIsRegistered = !user.isAnonymous; // true if email/password

      if (isNewUserDocument) {
        console.log(`User doc for ${user.uid} not found, creating…`);
        userDataForWrite = {
          username: user.isAnonymous
            ? generateGuestUsername()
            : (user.displayName || user.email || `User_${user.uid.substring(0, 5)}`),
          email:       user.email || null,  // null for anonymous
          createdAt:   serverTimestamp(),
          isRegistered: currentIsRegistered,

          // Default stats scaffold
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

          cmeStats: {
            totalAnswered: 0,
            totalCorrect:  0,
            eligibleAnswerCount: 0,
            creditsEarned:  0.0,
            creditsClaimed: 0.0
          },
          cmeAnsweredQuestions: {},
          cmeClaimHistory: []
        };

        if (currentIsRegistered && user.email) {
          userDataForWrite.email = user.email;
        }
      } else {
        // ---- Existing Firestore user doc ----
        const existingData = userDocSnap.data();
        console.log(
          `Found user doc for ${user.uid}. isAnonymous=${user.isAnonymous}, stored isRegistered=${existingData.isRegistered}`
        );

        // Sync the isRegistered flag if it changed
        if (existingData.isRegistered !== currentIsRegistered) {
          console.log(`Correcting isRegistered for ${user.uid}`);
          userDataForWrite.isRegistered = currentIsRegistered;
        }

        // Update email if newly registered
        if (currentIsRegistered && user.email && existingData.email !== user.email) {
          userDataForWrite.email = user.email;
        }

        // Ensure anonymous users keep a guest-style username
        if (
          user.isAnonymous &&
          (!existingData.username ||
            !/^((Curious|Medical|Swift|Learning|Aspiring)(Learner|Student|User|Doctor|Practitioner))/.test(
              existingData.username
            ))
        ) {
          userDataForWrite.username = generateGuestUsername();
        }
      }

      // Write new or updated fields if needed
      if (isNewUserDocument || Object.keys(userDataForWrite).length > 0) {
        try {
          await setDoc(userDocRef, userDataForWrite, { merge: true });
          console.log(
            `User doc ${isNewUserDocument ? 'created' : 'updated'} for ${user.uid}`
          );
        } catch (err) {
          console.error('Error writing user doc:', err);
        }
      }

      window.authState.isRegistered = currentIsRegistered;
    } else {
      // ---------- No user signed in ----------
      window.authState.user        = null;
      window.authState.isRegistered = false;

      console.log('No user signed in – attempting anonymous sign-in…');
      try {
        await signInAnonymously(auth);
        console.log('Signed in anonymously.');
      } catch (err) {
        console.error('Anonymous sign-in error:', err);
        window.authState.isLoading = false;
      }
    }

    if (window.authState.user || !user) {
      window.authState.isLoading = false;
    }

    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: {
          user:        window.authState.user,
          isRegistered: window.authState.isRegistered,
          isLoading:   window.authState.isLoading
        }
      })
    );
  });

  return () => {
    if (authStateListener) {
      console.log('Cleaning up auth state listener.');
      authStateListener();
      authStateListener = null;
    }
  };
}

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
async function registerUser(email, password, username, experience) {
  try {
    console.log(`registerUser: creating ${email}`);
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(user, { displayName: username });

    const userDocRef = doc(db, 'users', user.uid);
    await setDoc(
      userDocRef,
      {
        username,
        email,
        experience,
        isRegistered: true,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    window.authState.user        = user;
    window.authState.isRegistered = true;

    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: { ...window.authState, isRegistered: true }
      })
    );

    return user;
  } catch (err) {
    console.error('registerUser error:', err);
    throw err;
  }
}

// ----------------------------------------------------
// Upgrade currently anonymous user to permanent account
async function upgradeAnonymousUser(email, password, username, experience) {
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
    await setDoc(
      userDocRef,
      {
        username,
        email,
        experience,
        isRegistered: true,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    window.authState.user        = upgradedUser;
    window.authState.isRegistered = true;

    window.dispatchEvent(
      new CustomEvent('authStateChanged', {
        detail: { ...window.authState, user: upgradedUser, isRegistered: true }
      })
    );

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
    return user;
  } catch (err) {
    console.error('loginUser error:', err);
    throw err;
  }
}

async function logoutUser() {
  try {
    if (typeof cleanupOnLogout === 'function') {
      await cleanupOnLogout(); // defined elsewhere
    }
    await signOut(auth);
    console.log('Logged out – anonymous sign-in will run via onAuthStateChanged.');
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
