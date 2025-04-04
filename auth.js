// auth.js - Authentication functionality for MedSwipe

// Global reference to the auth state listener
let authStateListener = null;

// Auth state management - accessible throughout the app
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
  // We'll use the auth object from the window (set by firebase-config.js)
  const auth = window.auth;
  const db = window.db;
  
  if (!auth || !db) {
    console.error("Firebase auth or db not initialized yet. Will retry in 500ms.");
    setTimeout(initAuth, 500);
    return;
  }
  
  console.log("Initializing auth system");
  
  // Set up auth state listener
  authStateListener = onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed:", user ? user.uid : 'No user');
    window.authState.isLoading = true;
    
    if (user) {
      // User is signed in
      window.authState.user = user;
      
      // Check if this is a registered user or anonymous guest
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const isRegistered = userDoc.exists() && userDoc.data().isRegistered === true;
      window.authState.isRegistered = isRegistered;
      
      // In the auth state listener where anonymous users are created
if (!userDoc.exists()) {
  // Create a new user document for this anonymous user
  await setDoc(doc(db, 'users', user.uid), {
    username: generateGuestUsername(),
    createdAt: serverTimestamp(),
    isRegistered: false, // EXPLICITLY set to false
    stats: {
      totalAnswered: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      categories: {},
      totalTimeSpent: 0,
      xp: 0,
      level: 1
    }
  });
}
    } else {
      // No user is signed in, reset auth state
      window.authState.user = null;
      window.authState.isRegistered = false;
      
      // Automatically sign in anonymously
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Error signing in anonymously:", error);
      }
    }
    
    window.authState.isLoading = false;
    
    // Dispatch an event that components can listen for
    window.dispatchEvent(new CustomEvent('authStateChanged', { 
      detail: { ...window.authState }
    }));
  });
  
  // Return cleanup function
  return () => {
    if (authStateListener) {
      authStateListener();
      authStateListener = null;
    }
  };
}

/**
 * Check if the current user is registered (not anonymous)
 * @returns {boolean} True if user is registered, false if guest
 */
function isUserRegistered() {
  return window.authState.isRegistered;
}

/**
 * Get the current user object
 * @returns {Object|null} The current user or null if not signed in
 */
function getCurrentUser() {
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
  const auth = window.auth;
  const db = window.db;
  
  try {
    // Create the user with email/password
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update profile with username
    await updateProfile(user, { displayName: username });
    
    // Get any existing data for this user (if they were anonymous before)
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    const existingData = userDoc.exists() ? userDoc.data() : {};
    
    // Create or update the user document
    await setDoc(userDocRef, {
      ...existingData,
      username: username,
      email: email,
      experience: experience,
      isRegistered: true, // EXPLICITLY set to true
      updatedAt: serverTimestamp(),
      ...(userDoc.exists() ? {} : {
        createdAt: serverTimestamp(),
        stats: {
          totalAnswered: 0,
          totalCorrect: 0,
          totalIncorrect: 0,
          categories: {},
          totalTimeSpent: 0,
          xp: 0,
          level: 1
        }
      })
    }, { merge: true });
    
    return user;
  } catch (error) {
    console.error("Error registering user:", error);
    throw error;
  }
}

/**
 * Log in a user with email and password
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<Object>} The logged in user
 */
async function loginUser(email, password) {
  const auth = window.auth;
  
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
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
  const auth = window.auth;
  
  try {
    // First clean up UI elements
    await cleanupOnLogout();
    
    // Then sign out
    await signOut(auth);
    // Will automatically sign in anonymously due to our auth state listener
    
    console.log("User logged out successfully");
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

/**
 * Convert an anonymous account to a registered account
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} username - User's display name
 * @param {string} experience - User's experience level
 * @returns {Promise<Object>} The upgraded user
 */
async function upgradeAnonymousUser(email, password, username, experience) {
  // This is a simplified implementation
  // In a real app, you would use Firebase's linkWithCredential
  // For now, we'll just register a new user and copy their data
  
  const auth = window.auth;
  const db = window.db;
  const currentUser = auth.currentUser;
  
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error("No anonymous user to upgrade");
  }
  
  const anonymousUid = currentUser.uid;
  
  try {
    // Get existing user data
    const userDocRef = doc(db, 'users', anonymousUid);
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    // Sign out anonymous user
    await signOut(auth);
    
    // Create new registered user
    const newUser = await registerUser(email, password, username, experience);
    
    // Copy data from anonymous user
    if (userDoc.exists()) {
      const newUserDocRef = doc(db, 'users', newUser.uid);
      await setDoc(newUserDocRef, {
        ...userData,
        username: username,
        email: email,
        experience: experience,
        isRegistered: true, // EXPLICITLY set to true
        previousAnonymousUid: anonymousUid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    
    return newUser;
  } catch (error) {
    console.error("Error upgrading anonymous user:", error);
    // If something goes wrong, sign back in anonymously
    await signInAnonymously(auth);
    throw error;
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

// Make the auth functions available globally
window.authFunctions = {
  isUserRegistered,
  getCurrentUser,
  registerUser,
  loginUser,
  logoutUser,
  upgradeAnonymousUser
};

// These functions will be called from firebase-config.js after Firebase is initialized
window.initAuthModule = function() {
  // Setup access to Firebase methods from window
  window.onAuthStateChanged = onAuthStateChanged;
  window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
  window.signInWithEmailAndPassword = signInWithEmailAndPassword;
  window.signInAnonymously = signInAnonymously;
  window.signOut = signOut;
  window.updateProfile = updateProfile;
  window.setDoc = setDoc;
  window.getDoc = getDoc;
  window.doc = doc;
  window.serverTimestamp = serverTimestamp;
  
  // Initialize auth system
  initAuth();
};
