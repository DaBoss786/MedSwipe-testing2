// app.js - Top of file
import { app, auth, db, doc, getDoc, runTransaction, serverTimestamp, collection, getDocs, getIdToken, sendPasswordResetEmail, functions, httpsCallable, updateDoc } from './firebase-config.js'; // Adjust path if needed
// Import needed functions from user.js
import { updateUserXP, updateUserMenu, calculateLevelProgress, getLevelInfo, toggleBookmark } from './user.js';
import { loadQuestions, initializeQuiz, fetchQuestionBank } from './quiz.js';
import { showLeaderboard, showAbout, showFAQ, showContactModal } from './ui.js';
import { closeSideMenu, closeUserMenu, shuffleArray } from './utils.js';
import { displayPerformance } from './stats.js';

// --- Get reference to Firebase Callable Function ---
let createCheckoutSessionFunction;
let createPortalSessionFunction;
try {
    if (functions && httpsCallable) { // Check if imports exist
         createCheckoutSessionFunction = httpsCallable(functions, 'createStripeCheckoutSession');
         createPortalSessionFunction = httpsCallable(functions, 'createStripePortalSession');
         console.log("Callable function reference 'createStripeCheckoutSession' created.");
    } else {
         console.error("Firebase Functions or httpsCallable not imported correctly.");
         // Disable checkout button maybe?
    }
} catch(error) {
     console.error("Error getting callable function reference:", error);
     // Disable checkout button maybe?
}
// ---

// Add splash screen, welcome screen, and authentication-based routing
document.addEventListener('DOMContentLoaded', function() {
  try {
    // Ensure imported 'functions' instance exists
    if (typeof functions === 'undefined') {
        throw new Error("Imported 'functions' instance is undefined.");
    }
    // Ensure imported 'httpsCallable' exists
    if (typeof httpsCallable === 'undefined') {
        throw new Error("Imported 'httpsCallable' function is undefined.");
    }

    window.generateCmeCertificateFunction = httpsCallable(functions, 'generateCmeCertificate');
    console.log("Callable function reference created globally using imported instance.");
} catch (error) {
    console.error("Error creating callable function reference:", error);
    // Handle error - maybe disable the claim button?
}

  const splashScreen = document.getElementById('splashScreen');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const mainOptions = document.getElementById('mainOptions');

  // Immediately hide the dashboard to prevent it from being visible at any point
  if (mainOptions) {
    mainOptions.style.display = 'none';
  }
  
  // Ensure welcome screen is ready but hidden
  if (welcomeScreen) {
    welcomeScreen.style.display = 'flex';
    welcomeScreen.style.opacity = '0';
  }
  
  // Update the auth state change listener to properly handle welcome screen
window.addEventListener('authStateChanged', function(event) {
  console.log('Auth state changed in app.js:', event.detail);
  if (event.detail.user && event.detail.user.isAnonymous && !event.detail.isRegistered) {
    cleanupOnLogout();
  }
  
  // Once authentication is initialized and not loading
  if (!event.detail.isLoading) {
    // Hide splash screen after 2 seconds
    setTimeout(function() {
      if (splashScreen) {
        splashScreen.classList.add('fade-out');
        
        // After splash fades out, decide where to go based on auth state
        setTimeout(function() {
          splashScreen.style.display = 'none';
          
          // First ensure all screens are properly hidden regardless of auth state
          ensureAllScreensHidden();
          
          if (event.detail.isRegistered) {
            // Registered user - go straight to dashboard
            console.log('User is registered, showing dashboard');
            if (mainOptions) {
              mainOptions.style.display = 'flex';
              // Use the enhanced initialization with a slightly longer delay
              setTimeout(() => {
                forceReinitializeDashboard();
              }, 100);
            }
          } else {
            // Guest user - show welcome screen properly
            console.log('User is guest, showing welcome screen');
            if (welcomeScreen) {
              welcomeScreen.style.display = 'flex';
              welcomeScreen.style.opacity = '1';
            }
          }
        }, 500); // Matches the transition duration in CSS
      }
    }, 2000);
  }
});
  
  // Handle welcome screen buttons
  const startLearningBtn = document.getElementById('startLearningBtn');
  const existingAccountBtn = document.getElementById('existingAccountBtn');

  if (startLearningBtn) {
  startLearningBtn.addEventListener("click", function() {
    // Hide welcome screen
    welcomeScreen.style.opacity = '0';
    
    setTimeout(function() {
      welcomeScreen.style.display = 'none';
      
      // Show onboarding loading screen
      const onboardingLoadingScreen = document.getElementById('onboardingLoadingScreen');
      if (onboardingLoadingScreen) {
        onboardingLoadingScreen.style.display = 'flex';
        
        // After a brief delay, start the onboarding quiz
        setTimeout(function() {
          onboardingLoadingScreen.style.display = 'none';
          startOnboardingQuiz();
        }, 2000); // Show loading screen for 2 seconds
      }
    }, 500);
  });
}

  // Function to start the onboarding quiz with 3 questions
function startOnboardingQuiz() {
  // Start a 3-question quiz
  loadQuestions({
    type: 'random',
    num: 3,
    includeAnswered: false,
    isOnboarding: true  // Flag to indicate this is the onboarding quiz
  });
}

  if (existingAccountBtn) {
  existingAccountBtn.addEventListener('click', function() {
    console.log("'I already have an account' button clicked");
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    if (welcomeScreen) {
      // Fade out welcome screen
      welcomeScreen.style.opacity = '0';
      
      setTimeout(function() {
        // Hide welcome screen
        welcomeScreen.style.display = 'none';
        
        // Show the login form with back button (true = from welcome screen)
        showLoginForm(true);
      }, 500);
    }
  });
}
// --- Step 3: CME Module Button Logic ---

// --- MORE DEBUGGING Step 3: CME Module Button Logic ---

const cmeModuleBtn = document.getElementById("cmeModuleBtn");
if (cmeModuleBtn) {
    // Make the event listener async to use await
    cmeModuleBtn.addEventListener("click", async function() {
        console.log("--- CME Module Button Click Handler START ---");

        // 1. Check Authentication State
        if (!auth || !auth.currentUser) {
            console.error("DEBUG: Auth object or currentUser is missing!");
            alert("Authentication error. Please refresh and log in again.");
            return;
        }
        if (auth.currentUser.isAnonymous) {
            console.log("DEBUG: User is anonymous. Showing info screen.");
            showCmeInfoScreen();
            return;
        }

        const uid = auth.currentUser.uid;
        console.log(`DEBUG: Authenticated User UID: ${uid}`);
        const userDocRef = doc(db, 'users', uid);

        try {
            // 2. Fetch the LATEST user data directly from Firestore
            console.log(`DEBUG: Attempting to fetch Firestore doc: users/${uid}`);
            const userDocSnap = await getDoc(userDocRef); // Use await

            let hasActiveAnnualSub = false;
            let availableCredits = 0;
            let rawCreditsValue; // Variable to store the raw value

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                console.log("DEBUG: Successfully fetched userData:", JSON.stringify(userData)); // Log the entire data object

                // 3. Read the relevant fields from the FRESH data
                hasActiveAnnualSub = userData.cmeSubscriptionActive === true;
                // *** CRITICAL: Read the raw value first ***
                rawCreditsValue = userData.cmeCreditsAvailable;
                availableCredits = userData.cmeCreditsAvailable || 0; // Default to 0

                console.log(`DEBUG: Raw cmeCreditsAvailable value from Firestore:`, rawCreditsValue);
                console.log(`DEBUG: Type of cmeCreditsAvailable: ${typeof rawCreditsValue}`);
                console.log(`DEBUG: Parsed availableCredits value (used in check): ${availableCredits}`);
                console.log(`DEBUG: Parsed hasActiveAnnualSub value: ${hasActiveAnnualSub}`);

            } else {
                console.warn(`DEBUG: User document not found in Firestore for UID: ${uid} during access check.`);
                showCmeInfoScreen();
                return;
            }

            // 4. The Decision Logic - Check BOTH conditions
            console.log(`DEBUG: Evaluating condition: (${hasActiveAnnualSub} || ${availableCredits} > 0)`);
            if (hasActiveAnnualSub || availableCredits > 0) {
                // User HAS access
                console.log("DEBUG: Access GRANTED. Calling showCmeDashboard().");
                showCmeDashboard(); // Show the actual CME content
            } else {
                // User does NOT have access
                console.log("DEBUG: Access DENIED. Calling showCmeInfoScreen().");
                showCmeInfoScreen(); // Show the purchase/info screen
            }

        } catch (err) {
            // Handle errors during Firestore fetch
            console.error("DEBUG: Error during Firestore fetch or processing:", err);
            alert("Could not verify your CME access status. Please try again later.");
        } finally {
             console.log("--- CME Module Button Click Handler END ---");
        }
    });
    console.log("DEBUG: Event listener attached to cmeModuleBtn."); // Confirm listener attachment
} else {
    console.error("DEBUG: CME Module button (#cmeModuleBtn) not found during listener setup.");
}
// --- End of MORE DEBUGGING Step 3 ---

// Add event listener for the CME Dashboard's back button
const cmeDashboardBackBtn = document.getElementById("cmeDashboardBackBtn");
if(cmeDashboardBackBtn) {
    cmeDashboardBackBtn.addEventListener("click", function() {
        console.log("CME Dashboard Back button clicked."); // For debugging
        const cmeDashboard = document.getElementById("cmeDashboardView");
        const mainOptions = document.getElementById("mainOptions"); // Assuming this is your main dashboard view ID

        if (cmeDashboard) {
            cmeDashboard.style.display = "none";
        }
        // Ensure mainOptions exists before trying to show it
        if (mainOptions) {
            mainOptions.style.display = "flex"; // Show main options again
        } else {
             console.error("Main options element (#mainOptions) not found when going back.");
        }
    });
} else {
     console.error("CME Dashboard Back button (#cmeDashboardBackBtn) not found.");
}

// --- Step 5a: Activate Start CME Quiz Button ---

const startCmeQuizBtn = document.getElementById("startCmeQuizBtn");
if (startCmeQuizBtn) {
    startCmeQuizBtn.addEventListener("click", function() {
        console.log("Start CME Quiz button clicked."); // For debugging
        const cmeQuizSetupModal = document.getElementById("cmeQuizSetupModal");
        if (cmeQuizSetupModal) {
            // Populate categories before showing
            populateCmeCategoryDropdown(); // Call the function to fill the dropdown
            cmeQuizSetupModal.style.display = "block"; // Show the modal
        } else {
            console.error("CME Quiz Setup Modal (#cmeQuizSetupModal) not found.");
        }
    });
} else {
    console.error("Start CME Quiz button (#startCmeQuizBtn) not found.");
}

// Add listeners for the modal's own buttons (Cancel)
const modalCancelCmeQuizBtn = document.getElementById("modalCancelCmeQuizBtn");
if (modalCancelCmeQuizBtn) {
    modalCancelCmeQuizBtn.addEventListener("click", function() {
        const cmeQuizSetupModal = document.getElementById("cmeQuizSetupModal");
        if (cmeQuizSetupModal) {
            cmeQuizSetupModal.style.display = "none"; // Hide the modal
        }
    });
}
// --- Step 7: Handle Start CME Quiz button click from Modal ---

const modalStartCmeQuizBtn = document.getElementById("modalStartCmeQuizBtn");
if (modalStartCmeQuizBtn) {
    modalStartCmeQuizBtn.addEventListener("click", function() {
        console.log("Modal Start CME Quiz button clicked."); // For debugging

        // Get the selected options from the modal
        const categorySelect = document.getElementById("cmeCategorySelect");
        const numQuestionsInput = document.getElementById("cmeNumQuestions");
        const includeAnsweredCheckbox = document.getElementById("cmeIncludeAnsweredCheckbox");

        const selectedCategory = categorySelect ? categorySelect.value : "";
        // Ensure numQuestions is read correctly and parsed as an integer
        let numQuestions = numQuestionsInput ? parseInt(numQuestionsInput.value, 10) : 12; // Base 10 parse

        // --- UPDATED VALIDATION ---
        // Validate the parsed number (allow 1 to 50)
        if (isNaN(numQuestions) || numQuestions < 1) { // Check if Not-a-Number or less than 1
            console.warn(`Invalid number input (${numQuestionsInput.value}), defaulting to 12.`);
            numQuestions = 12; // Default to 12 if parsing fails or below min
        } else if (numQuestions > 50) { // Check if greater than 50
             console.warn(`Number input (${numQuestionsInput.value}) exceeds max 50, capping at 50.`);
             numQuestions = 50; // Cap at max limit
        }
        // No need for Math.max(3, ...) anymore

        const includeAnswered = includeAnsweredCheckbox ? includeAnsweredCheckbox.checked : false;

        console.log("CME Quiz Options:", { // Log the FINAL options being passed
            quizType: 'cme',
            category: selectedCategory,
            num: numQuestions, // Ensure this logs the correct number
            includeAnswered: includeAnswered
        });

        // Hide the setup modal
        const cmeQuizSetupModal = document.getElementById("cmeQuizSetupModal");
        if (cmeQuizSetupModal) {
            cmeQuizSetupModal.style.display = "none";
        }

        // Hide the CME Dashboard view itself
        const cmeDashboard = document.getElementById("cmeDashboardView");
         if (cmeDashboard) {
             cmeDashboard.style.display = "none";
         }

        // Call loadQuestions with the CME options
        // Make sure loadQuestions is accessible (it should be if defined in quiz.js which is loaded)
        if (typeof loadQuestions === 'function') {
            loadQuestions({
                quizType: 'cme', // Specify the quiz type
                category: selectedCategory,
                num: numQuestions,
                includeAnswered: includeAnswered
            });
        } else {
            console.error("loadQuestions function is not defined or accessible.");
            alert("Error starting CME quiz. Function not found.");
             // Show CME dashboard again as fallback
             if (cmeDashboard) cmeDashboard.style.display = "block";
        }
    });
} else {
    console.error("Modal Start CME Quiz button (#modalStartCmeQuizBtn) not found.");
}

// --- End of Step 7 Code ---

// --- Step 12a: Claim Modal Button Event Listeners ---

const claimCmeBtn = document.getElementById("claimCmeBtn"); // Button on CME Dashboard
const cmeClaimModal = document.getElementById("cmeClaimModal"); // The modal itself
const closeCmeClaimModalBtn = document.getElementById("closeCmeClaimModal"); // Close (X) button
const cancelCmeClaimBtn = document.getElementById("cancelCmeClaimBtn"); // Cancel button inside modal
const cmeClaimForm = document.getElementById("cmeClaimForm"); // The form inside the modal
const commercialBiasRadios = document.querySelectorAll('input[name="evalCommercialBias"]'); // Radios for bias question
const commercialBiasCommentDiv = document.getElementById("commercialBiasCommentDiv"); // Comment div

// Listener for the main "Claim CME Credit" button on the dashboard
if (claimCmeBtn && cmeClaimModal) {
    claimCmeBtn.addEventListener('click', function() {
        // Only open if not disabled (which means credits >= 0.25)
        if (!claimCmeBtn.disabled) {
            console.log("Claim CME button clicked, opening modal.");
            prepareClaimModal(); // Call helper to set available credits etc.
            document.getElementById('cmeModalOverlay').style.display = 'block';
            cmeClaimModal.style.display = 'block'; // Use 'block' or 'flex' based on your final CSS
        } else {
            console.log("Claim CME button clicked, but disabled (not enough credits).");
        }
    });
} else {
    console.error("Claim button or Claim modal not found.");
}

// Listener for the modal's Close (X) button
if (closeCmeClaimModalBtn && cmeClaimModal) {
    closeCmeClaimModalBtn.addEventListener('click', function() {
        console.log("Close claim modal button clicked.");
        document.getElementById('cmeModalOverlay').style.display = 'none';
        cmeClaimModal.style.display = 'none';
    });
}

// Listener for the modal's Cancel button
if (cancelCmeClaimBtn && cmeClaimModal) {
    cancelCmeClaimBtn.addEventListener('click', function() {
        console.log("Cancel claim modal button clicked.");
        document.getElementById('cmeModalOverlay').style.display = 'none';
        cmeClaimModal.style.display = 'none';
    });
}

// Listener for the Commercial Bias radio buttons to show/hide comment box
if (commercialBiasRadios.length > 0 && commercialBiasCommentDiv) {
    commercialBiasRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'No' && this.checked) {
                commercialBiasCommentDiv.style.display = 'block'; // Show comment box
            } else {
                commercialBiasCommentDiv.style.display = 'none'; // Hide comment box
                // Optionally clear the comment box when hiding
                // const commentTextarea = document.getElementById('evalCommercialBiasComment');
                // if (commentTextarea) commentTextarea.value = '';
            }
        });
    });
}

// Listener for the Form Submission (Step 12b will handle the actual submission logic)
if (cmeClaimForm) {
    cmeClaimForm.addEventListener('submit', handleCmeClaimSubmission); // Call submission handler
}

// --- End of Step 12a ---
  
});

// Function to show the login form modal
function showLoginForm(fromWelcomeScreen = false) {
  // Create login modal if it doesn't exist
  let loginModal = document.getElementById('loginModal');
  
  if (!loginModal) {
    loginModal = document.createElement('div');
    loginModal.id = 'loginModal';
    loginModal.className = 'auth-modal';
    
    loginModal.innerHTML = `
      <div class="auth-modal-content">
        ${fromWelcomeScreen ? '<button id="backToWelcomeBtn" style="position: absolute; top: 15px; left: 15px; background: none; border: none; font-size: 1.2rem; color: #0056b3; cursor: pointer;">&larr;</button>' : ''}
        <img src="MedSwipe Logo gradient.png" alt="MedSwipe Logo" class="auth-logo">
        <h2>Log In to MedSwipe</h2>
        <div id="loginError" class="auth-error"></div>
        <form id="loginForm">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input type="email" id="loginEmail" required>
          </div>
          <div class="form-group">
            <label for="loginPassword">Password</label>
            <input type="password" id="loginPassword" required>
          </div>
          <div class="auth-buttons">
            <button type="submit" class="auth-primary-btn">Log In</button>
          </div>
          <div style="text-align: center; margin-top: 15px;">
            <a href="#" id="forgotPasswordLink" style="color: #0056b3; text-decoration: none; font-size: 0.9rem;">Forgot Password?</a>
          </div>
          <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
            <p style="margin-bottom: 10px; color: #666;">Don't have an account?</p>
            <button type="button" id="createAccountBtn" class="auth-secondary-btn" onclick="window.showRegisterForm()">Create Account</button>
          </div>
        </form>
        <button id="closeLoginBtn" class="auth-close-btn">×</button>
      </div>
    `;
    
    document.body.appendChild(loginModal);
    
    // Add event listeners
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errorElement = document.getElementById('loginError');
      
      try {
        errorElement.textContent = '';
        await window.authFunctions.loginUser(email, password);
        // Success - close modal and show dashboard
        loginModal.style.display = 'none';
        document.getElementById('mainOptions').style.display = 'flex';
        ensureEventListenersAttached(); // Make sure event listeners are attached
      } catch (error) {
        // Show error message
        errorElement.textContent = getAuthErrorMessage(error);
      }
    });
    
    document.getElementById('createAccountBtn').addEventListener('click', function() {
  loginModal.style.display = 'none';
  
  // Check if the function exists and call it
  if (typeof showRegisterForm === 'function') {
    showRegisterForm();
  } else {
    // If the function doesn't exist, try to find it on the window object
    if (typeof window.showRegisterForm === 'function') {
      window.showRegisterForm();
    } else {
      console.error("Registration form function not found");
      alert("Sorry, there was an error accessing the registration form. Please try again later.");
    }
  }
});
    
    document.getElementById('closeLoginBtn').addEventListener('click', function() {
      loginModal.style.display = 'none';
      document.getElementById('mainOptions').style.display = 'flex';
    });
    
    // Add back button functionality if coming from welcome screen
    if (fromWelcomeScreen) {
      document.getElementById('backToWelcomeBtn').addEventListener('click', function() {
        loginModal.style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('welcomeScreen').style.opacity = '1';
      });
    }
  } else {
    // If modal already exists but we need to add/remove back button
    const existingBackBtn = loginModal.querySelector('#backToWelcomeBtn');
    const modalContent = loginModal.querySelector('.auth-modal-content');
    
    if (fromWelcomeScreen && !existingBackBtn) {
      // Add back button if coming from welcome screen
      const backBtn = document.createElement('button');
      backBtn.id = 'backToWelcomeBtn';
      backBtn.innerHTML = '&larr;';
      backBtn.style = 'position: absolute; top: 15px; left: 15px; background: none; border: none; font-size: 1.2rem; color: #0056b3; cursor: pointer;';
      
      backBtn.addEventListener('click', function() {
        loginModal.style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'flex';
        document.getElementById('welcomeScreen').style.opacity = '1';
      });
      
      if (modalContent) {
        modalContent.insertBefore(backBtn, modalContent.firstChild);
      }
    } else if (!fromWelcomeScreen && existingBackBtn) {
      // Remove back button if not coming from welcome screen
      existingBackBtn.remove();
    }
  }
  
  // Show the modal
  loginModal.style.display = 'flex';
}

window.showLoginForm = showLoginForm;

// Function to show the registration form modal
function showRegisterForm() {
  // Create registration modal if it doesn't exist
  let registerModal = document.getElementById('registerModal');
  
  if (!registerModal) {
    registerModal = document.createElement('div');
    registerModal.id = 'registerModal';
    registerModal.className = 'auth-modal';
    
    registerModal.innerHTML = `
  <div class="auth-modal-content">
    <img src="MedSwipe Logo gradient.png" alt="MedSwipe Logo" class="auth-logo">
    <h2>Create MedSwipe Account</h2>
    <div id="registerError" class="auth-error"></div>
    <form id="registerForm">
      <div class="form-group">
        <label for="registerUsername">Username</label>
        <input type="text" id="registerUsername" required>
      </div>
      <div class="form-group">
        <label for="registerExperience">Experience Level</label>
        <select id="registerExperience" required>
          <option value="" disabled selected>Select your experience level</option>
          <option value="Medical Student">Medical Student</option>
          <option value="PGY 1-2">PGY 1-2</option>
          <option value="PGY 3-4">PGY 3-4</option>
          <option value="PGY 5+">PGY 5+</option>
          <option value="Attending">Attending</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label for="registerEmail">Email</label>
        <input type="email" id="registerEmail" required>
      </div>
      <div class="form-group">
        <label for="registerPassword">Password</label>
        <input type="password" id="registerPassword" required minlength="6">
        <small>Password must be at least 6 characters</small>
      </div>
      <div class="form-group terms-container">
  <div class="terms-checkbox">
    <input type="checkbox" id="agreeTerms" required>
    <label for="agreeTerms">
      I agree to the <a href="#" id="registerViewTOS">Terms of Service</a> and 
      <a href="#" id="registerViewPrivacy">Privacy Policy</a>
    </label>
  </div>
  <div class="form-error" id="termsError"></div>
</div>
      <div class="auth-buttons">
        <button type="submit" class="auth-primary-btn">Create Account</button>
        <button type="button" id="goToLoginBtn" class="auth-secondary-btn">I Already Have an Account</button>
      </div>
    </form>
    <button id="closeRegisterBtn" class="auth-close-btn">×</button>
  </div>
`;
    
    document.body.appendChild(registerModal);
    
    // Add event listeners
    document.getElementById('registerForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('registerUsername').value;
      const email = document.getElementById('registerEmail').value;
      const password = document.getElementById('registerPassword').value;
      const experience = document.getElementById('registerExperience').value;
      const errorElement = document.getElementById('registerError');
      
      try {
        errorElement.textContent = '';
        
        if (window.authState.user && window.authState.user.isAnonymous) {
          // Upgrade anonymous user
          await window.authFunctions.upgradeAnonymousUser(email, password, username, experience);
        } else {
          // Create new user
          await window.authFunctions.registerUser(email, password, username, experience);
        }
        
        // Success - close modal and show dashboard
        registerModal.style.display = 'none';
        document.getElementById('mainOptions').style.display = 'flex';
        ensureEventListenersAttached(); // Add this line
      } catch (error) {
        // Show error message
        errorElement.textContent = getAuthErrorMessage(error);
      }
    });
    
    document.getElementById('goToLoginBtn').addEventListener('click', function() {
      registerModal.style.display = 'none';
      showLoginForm();
    });
    
    document.getElementById('closeRegisterBtn').addEventListener('click', function() {
      registerModal.style.display = 'none';
      document.getElementById('mainOptions').style.display = 'flex';
    });
  }
  
  // Show the modal
  registerModal.style.display = 'flex';
}

window.showRegisterForm = showRegisterForm;

// Helper function to get user-friendly error messages
function getAuthErrorMessage(error) {
  const errorCode = error.code;
  
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address format';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists';
    case 'auth/weak-password':
      return 'Password is too weak';
    case 'auth/network-request-failed':
      return 'Network error - please check your connection';
    default:
      return error.message || 'An unknown error occurred';
  }
}

// Main app initialization
window.addEventListener('load', function() {
  // Ensure functions are globally available
  window.updateUserXP = updateUserXP || function() {
    console.log("updateUserXP not loaded yet");
  };
  
  window.updateUserMenu = updateUserMenu || function() {
    console.log("updateUserMenu not loaded yet");
  };
  
  // Initialize user menu with username
  const checkAuthAndInit = function() {
    if (auth && auth.currentUser) {
      // Initialize user menu with username
      window.updateUserMenu();
    } else {
      // If auth isn't ready yet, check again in 1 second
      setTimeout(checkAuthAndInit, 1000);
    }
  };
  
  // Start checking for auth
  checkAuthAndInit();
  
  // Score circle click => open user menu
  const scoreCircle = document.getElementById("scoreCircle");
  if (scoreCircle) {
    scoreCircle.addEventListener("click", function() {
      const userMenu = document.getElementById("userMenu");
      const menuOverlay = document.getElementById("menuOverlay");
      if (userMenu && menuOverlay) {
        userMenu.classList.add("open");
        menuOverlay.classList.add("show");
      }
    });
  }
  
  // User menu score circle click => go to FAQ
  const userScoreCircle = document.getElementById("userScoreCircle");
  if (userScoreCircle) {
    userScoreCircle.addEventListener("click", function() {
      closeUserMenu();
      showFAQ();
    });
  }
  
  // User menu close button
  const userMenuClose = document.getElementById("userMenuClose");
  if (userMenuClose) {
    userMenuClose.addEventListener("click", function() {
      closeUserMenu();
    });
  }
  
  // Performance from user menu
  const performanceItemUser = document.getElementById("performanceItemUser");
  if (performanceItemUser) {
    performanceItemUser.addEventListener("click", function() {
      closeUserMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      window.displayPerformance(); 
    });
  }
  
  // Bookmarks from user menu - start a bookmarks-only quiz
  const bookmarksFilterUser = document.getElementById("bookmarksFilterUser");
  if (bookmarksFilterUser) {
    bookmarksFilterUser.addEventListener("click", function(e) {
      e.preventDefault();
      closeUserMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      
      // Start a quiz with only bookmarked questions
      loadQuestions({
        bookmarksOnly: true,
        num: 50 // Large number to include all bookmarks
      });
    });
  }

  // --- Listener for View CME History Menu Item ---
const cmeHistoryMenuItem = document.getElementById("cmeHistoryMenuItem");
if (cmeHistoryMenuItem) {
    cmeHistoryMenuItem.addEventListener("click", function() {
        console.log("View CME Claim History menu item clicked.");
        closeUserMenu(); // Close the user menu first
        showCmeHistoryModal(); // Call the function to fetch data and show the modal
    });
} else {
    console.error("CME History Menu Item (#cmeHistoryMenuItem) not found.");
}

  // --- Manage Subscription Button ---
const manageSubBtn = document.getElementById('manageSubscriptionBtn');
if (manageSubBtn) {
    manageSubBtn.addEventListener('click', async () => {
        console.log("Manage Subscription button clicked.");

        // Ensure user is logged in and function ref exists
        const user = window.authFunctions.getCurrentUser();
        if (!user || user.isAnonymous) {
            alert("Please log in to manage your subscription.");
            return;
        }
        if (!createPortalSessionFunction) {
             alert("Error: Cannot connect to subscription manager. Please refresh.");
             console.error("createPortalSessionFunction reference missing.");
             return;
        }

        // Disable button and show loading state
        manageSubBtn.style.pointerEvents = 'none'; // Disable clicks
        manageSubBtn.textContent = 'Loading Portal...';
        manageSubBtn.style.opacity = '0.7';

        try {
            console.log("Calling createStripePortalSession function...");
            const result = await createPortalSessionFunction(); // No data needed from client
            const portalUrl = result.data.portalUrl;
            console.log("Received Portal URL:", portalUrl);

            if (portalUrl) {
                // Redirect the user to the Stripe Customer Portal
                window.location.href = portalUrl;
            } else {
                throw new Error("Portal URL was not returned from the function.");
            }
            // No need to re-enable button here as user is redirected

        } catch (error) {
            console.error("Error calling createStripePortalSession function:", error);
            let message = "Could not open the subscription portal. Please try again later.";
             if (error.code && error.message) { // Firebase Functions error format
                 // Provide more specific feedback if possible
                 if (error.code === 'failed-precondition' || error.message.includes("Subscription not found")) {
                      message = "No active subscription found to manage.";
                 } else {
                      message = `Error: ${error.message}`;
                 }
             }
            alert(message);
            // Re-enable button on error
            manageSubBtn.style.pointerEvents = 'auto';
            manageSubBtn.textContent = 'Manage Subscription';
            manageSubBtn.style.opacity = '1';
        }
    });
} else {
    console.error("Manage Subscription button not found.");
}
  
  // Reset progress from user menu
  const resetProgressUser = document.getElementById("resetProgressUser");
  if (resetProgressUser) {
    resetProgressUser.addEventListener("click", async function(e) {
      e.preventDefault();
      const confirmReset = confirm("Are you sure you want to reset all progress?");
      if (!confirmReset) return;
      
      if (!auth || !auth.currentUser) {
        alert("User not authenticated. Please try again later.");
        return;
      }
      
      const uid = auth.currentUser.uid;
      const userDocRef = doc(db, 'users', uid);
      try {
        await runTransaction(db, async (transaction) => {
          const userDoc = await transaction.get(userDocRef);
          if (userDoc.exists()) {
            let data = userDoc.data();
            data.answeredQuestions = {};
            data.stats = { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0 };
            data.streaks = { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 };
            transaction.set(userDocRef, data, { merge: true });
          }
        });
        alert("Progress has been reset!");
        if (typeof updateUserCompositeScore === 'function') {
          updateUserCompositeScore();
        }
        window.updateUserMenu();
      } catch (error) {
        console.error("Error resetting progress:", error);
        alert("There was an error resetting your progress.");
      }
      closeUserMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
    });
  }
  
  // CUSTOM QUIZ BUTTON => show modal
  const customQuizBtn = document.getElementById("customQuizBtn");
  if (customQuizBtn) {
    customQuizBtn.addEventListener("click", function() {
      window.filterMode = "all";
      closeSideMenu();
      document.getElementById("aboutView").style.display = "none";
      document.getElementById("faqView").style.display = "none";
      document.getElementById("customQuizForm").style.display = "block";
    });
  }
  
  // RANDOM QUIZ BUTTON => show modal
  const randomQuizBtn = document.getElementById("randomQuizBtn");
  if (randomQuizBtn) {
    randomQuizBtn.addEventListener("click", function() {
      window.filterMode = "all";
      closeSideMenu();
      document.getElementById("aboutView").style.display = "none";
      document.getElementById("faqView").style.display = "none";
      document.getElementById("randomQuizForm").style.display = "block";
    });
  }
  
  // START QUIZ (Custom) => hide modal, load quiz
  const startCustomQuiz = document.getElementById("startCustomQuiz");
  if (startCustomQuiz) {
    startCustomQuiz.addEventListener("click", function() {
      const categorySelect = document.getElementById("categorySelect");
      const customNumQuestions = document.getElementById("customNumQuestions");
      const includeAnsweredCheckbox = document.getElementById("includeAnsweredCheckbox");
      
      let category = categorySelect ? categorySelect.value : "";
      let numQuestions = customNumQuestions ? parseInt(customNumQuestions.value) || 10 : 10;
      let includeAnswered = includeAnsweredCheckbox ? includeAnsweredCheckbox.checked : false;
      
      const customQuizForm = document.getElementById("customQuizForm");
      if (customQuizForm) {
        customQuizForm.style.display = "none";
      }
      
      loadQuestions({
        type: 'custom',
        category: category,
        num: numQuestions,
        includeAnswered: includeAnswered
      });
    });
  }
  
  // CANCEL QUIZ (Custom)
  const cancelCustomQuiz = document.getElementById("cancelCustomQuiz");
  if (cancelCustomQuiz) {
    cancelCustomQuiz.addEventListener("click", function() {
      const customQuizForm = document.getElementById("customQuizForm");
      if (customQuizForm) {
        customQuizForm.style.display = "none";
      }
    });
  }
  
  // START QUIZ (Random) => hide modal, load quiz
  const startRandomQuiz = document.getElementById("startRandomQuiz");
  if (startRandomQuiz) {
    startRandomQuiz.addEventListener("click", function() {
      const randomNumQuestions = document.getElementById("randomNumQuestions");
      const includeAnsweredRandomCheckbox = document.getElementById("includeAnsweredRandomCheckbox");
      
      let numQuestions = randomNumQuestions ? parseInt(randomNumQuestions.value) || 10 : 10;
      let includeAnswered = includeAnsweredRandomCheckbox ? includeAnsweredRandomCheckbox.checked : false;
      
      const randomQuizForm = document.getElementById("randomQuizForm");
      if (randomQuizForm) {
        randomQuizForm.style.display = "none";
      }
      
      loadQuestions({
        type: 'random',
        num: numQuestions,
        includeAnswered: includeAnswered
      });
    });
  }
  
  // CANCEL QUIZ (Random)
  const cancelRandomQuiz = document.getElementById("cancelRandomQuiz");
  if (cancelRandomQuiz) {
    cancelRandomQuiz.addEventListener("click", function() {
      const randomQuizForm = document.getElementById("randomQuizForm");
      if (randomQuizForm) {
        randomQuizForm.style.display = "none";
      }
    });
  }
  
  // BOOKMARKS => now simply close the menu
  const bookmarksFilter = document.getElementById("bookmarksFilter");
  if (bookmarksFilter) {
    bookmarksFilter.addEventListener("click", function(e) {
      e.preventDefault();
      closeSideMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
    });
  }
  
  // START NEW QUIZ from side menu
  const startNewQuiz = document.getElementById("startNewQuiz");
  if (startNewQuiz) {
    startNewQuiz.addEventListener("click", function() {
      closeSideMenu();
      window.filterMode = "all";
      
      const swiperElement = document.querySelector(".swiper");
      if (swiperElement) swiperElement.style.display = "none";
      
      const bottomToolbar = document.getElementById("bottomToolbar");
      if (bottomToolbar) bottomToolbar.style.display = "none";
      
      const iconBar = document.getElementById("iconBar");
      if (iconBar) iconBar.style.display = "none";
      
      const performanceView = document.getElementById("performanceView");
      if (performanceView) performanceView.style.display = "none";
      
      const leaderboardView = document.getElementById("leaderboardView");
      if (leaderboardView) leaderboardView.style.display = "none";
      
      const faqView = document.getElementById("faqView");
      if (faqView) faqView.style.display = "none";
      
      const aboutView = document.getElementById("aboutView");
      if (aboutView) aboutView.style.display = "none";

      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      
      const mainOptions = document.getElementById("mainOptions");
      if (mainOptions) mainOptions.style.display = "flex";
    });
  }
  
  // LEADERBOARD
  const leaderboardItem = document.getElementById("leaderboardItem");
  if (leaderboardItem) {
    leaderboardItem.addEventListener("click", function() {
      closeSideMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      showLeaderboard();
    });
  }
  
  // FAQ
  const faqItem = document.getElementById("faqItem");
  if (faqItem) {
    faqItem.addEventListener("click", function() {
      closeSideMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      showFAQ();
    });
  }
  
  // ABOUT US
  const aboutItem = document.getElementById("aboutItem");
  if (aboutItem) {
    aboutItem.addEventListener("click", function() {
      closeSideMenu();
      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      showAbout();
    });
  }
  
  // CONTACT US
  const contactItem = document.getElementById("contactItem");
  if (contactItem) {
    contactItem.addEventListener("click", function() {
      closeSideMenu();
      
      const swiperElement = document.querySelector(".swiper");
      if (swiperElement) swiperElement.style.display = "none";
      
      const bottomToolbar = document.getElementById("bottomToolbar");
      if (bottomToolbar) bottomToolbar.style.display = "none";
      
      const iconBar = document.getElementById("iconBar");
      if (iconBar) iconBar.style.display = "none";
      
      const performanceView = document.getElementById("performanceView");
      if (performanceView) performanceView.style.display = "none";
      
      const leaderboardView = document.getElementById("leaderboardView");
      if (leaderboardView) leaderboardView.style.display = "none";
      
      const aboutView = document.getElementById("aboutView");
      if (aboutView) aboutView.style.display = "none";
      
      const faqView = document.getElementById("faqView");
      if (faqView) faqView.style.display = "none";

      const cmeDashboard = document.getElementById("cmeDashboardView");
if (cmeDashboard) cmeDashboard.style.display = "none";
      
      const mainOptions = document.getElementById("mainOptions");
      if (mainOptions) mainOptions.style.display = "none";
      
      showContactModal();
    });
  }
  
  // Side menu toggling - this is the crucial part that was causing the issue
  const menuToggle = document.getElementById("menuToggle");
  if (menuToggle) {
    menuToggle.addEventListener("click", function() {
      const sideMenu = document.getElementById("sideMenu");
      const menuOverlay = document.getElementById("menuOverlay");
      
      if (sideMenu) sideMenu.classList.add("open");
      if (menuOverlay) menuOverlay.classList.add("show");
    });
  }
  
  const menuClose = document.getElementById("menuClose");
  if (menuClose) {
    menuClose.addEventListener("click", function() {
      closeSideMenu();
    });
  }
  
  const menuOverlay = document.getElementById("menuOverlay");
  if (menuOverlay) {
    menuOverlay.addEventListener("click", function() {
      closeSideMenu();
      closeUserMenu();
    });
  }
  
  // Logo click => go to main menu
  const logoClick = document.getElementById("logoClick");
  if (logoClick) {
    logoClick.addEventListener("click", function() {
      closeSideMenu();
      closeUserMenu();
      
      const aboutView = document.getElementById("aboutView");
      if (aboutView) aboutView.style.display = "none";
      
      const faqView = document.getElementById("faqView");
      if (faqView) faqView.style.display = "none";
      
      const swiperElement = document.querySelector(".swiper");
      if (swiperElement) swiperElement.style.display = "none";
      
      const bottomToolbar = document.getElementById("bottomToolbar");
      if (bottomToolbar) bottomToolbar.style.display = "none";
      
      const iconBar = document.getElementById("iconBar");
      if (iconBar) iconBar.style.display = "none";
      
      const performanceView = document.getElementById("performanceView");
      if (performanceView) performanceView.style.display = "none";
      
      const leaderboardView = document.getElementById("leaderboardView");
      if (leaderboardView) leaderboardView.style.display = "none";

      const cmeDashboard = document.getElementById("cmeDashboardView");
    if (cmeDashboard) cmeDashboard.style.display = "none";
      
      const mainOptions = document.getElementById("mainOptions");
      if (mainOptions) mainOptions.style.display = "flex";
    });
  }
  
  // FEEDBACK button
  const feedbackButton = document.getElementById("feedbackButton");
  if (feedbackButton) {
    feedbackButton.addEventListener("click", function() {
      const questionId = getCurrentQuestionId();
      const questionSlide = document.querySelector(`.swiper-slide[data-id="${questionId}"]`);
      let questionText = "";
      if (questionSlide) {
        const questionElem = questionSlide.querySelector(".question");
        if (questionElem) {
          questionText = questionElem.textContent.trim();
        }
      }
      currentFeedbackQuestionId = questionId || "";
      currentFeedbackQuestionText = questionText || "";
      
      const feedbackQuestionInfo = document.getElementById("feedbackQuestionInfo");
      if (feedbackQuestionInfo) {
        feedbackQuestionInfo.textContent = `Feedback for Q: ${currentFeedbackQuestionText}`;
      }
      
      const feedbackModal = document.getElementById("feedbackModal");
      if (feedbackModal) {
        feedbackModal.style.display = "flex";
      }
    });
  }
  
  // FEEDBACK modal close
  const closeFeedbackModal = document.getElementById("closeFeedbackModal");
  if (closeFeedbackModal) {
    closeFeedbackModal.addEventListener("click", function() {
      const feedbackModal = document.getElementById("feedbackModal");
      if (feedbackModal) {
        feedbackModal.style.display = "none";
      }
    });
  }
  
  // FEEDBACK submit
  const submitFeedback = document.getElementById("submitFeedback");
  if (submitFeedback) {
    submitFeedback.addEventListener("click", async function() {
      const feedbackText = document.getElementById("feedbackText");
      if (!feedbackText || !feedbackText.value.trim()) {
        alert("Please enter your feedback.");
        return;
      }
      
      try {
        await Doc(collection(db, "feedback"), {
          questionId: currentFeedbackQuestionId,
          questionText: currentFeedbackQuestionText,
          feedback: feedbackText.value.trim(),
          timestamp: serverTimestamp()
        });
        alert("Thank you for your feedback!");
        
        if (feedbackText) {
          feedbackText.value = "";
        }
        
        const feedbackModal = document.getElementById("feedbackModal");
        if (feedbackModal) {
          feedbackModal.style.display = "none";
        }
      } catch (error) {
        console.error("Error submitting feedback:", error);
        alert("There was an error submitting your feedback. Please try again later.");
      }
    });
  }
  
  // FAVORITE button (bookmark functionality)
  const favoriteButton = document.getElementById("favoriteButton");
  if (favoriteButton) {
    favoriteButton.addEventListener("click", async function() {
      let questionId = getCurrentQuestionId();
      if (!questionId) return;
      
      const wasToggled = await toggleBookmark(questionId.trim());
      if (wasToggled) {
        favoriteButton.innerText = "★";
        favoriteButton.style.color = "#007BFF"; // Blue
      } else {
        favoriteButton.innerText = "☆";
        favoriteButton.style.color = "";
      }
    });
  }
  
  // CONTACT modal buttons
  const submitContact = document.getElementById("submitContact");
  if (submitContact) {
    submitContact.addEventListener("click", async function() {
      const contactEmail = document.getElementById("contactEmail");
      const contactMessage = document.getElementById("contactMessage");
      
      const email = contactEmail ? contactEmail.value.trim() : "";
      const message = contactMessage ? contactMessage.value.trim() : "";
      
      if (!message) {
        alert("Please enter your message.");
        return;
      }
      
      try {
        if (!auth || !auth.currentUser) {
          alert("User not authenticated. Please try again later.");
          return;
        }
        
        await Doc(collection(db, "contact"), {
          email: email,
          message: message,
          timestamp: serverTimestamp(),
          userId: auth.currentUser.uid
        });
        alert("Thank you for contacting us!");
        
        if (contactEmail) contactEmail.value = "";
        if (contactMessage) contactMessage.value = "";
        
        const contactModal = document.getElementById("contactModal");
        if (contactModal) {
          contactModal.style.display = "none";
        }
      } catch (error) {
        console.error("Error submitting contact:", error);
        alert("There was an error submitting your message. Please try again later.");
      }
    });
  }
  
  const closeContactModal = document.getElementById("closeContactModal");
  if (closeContactModal) {
    closeContactModal.addEventListener("click", function() {
      const contactModal = document.getElementById("contactModal");
      if (contactModal) {
        contactModal.style.display = "none";
      }
    });
  }
  
  // Clean up any existing LEVEL UP text on page load
  const textNodes = document.querySelectorAll('body > *:not([id])');
  textNodes.forEach(node => {
    if (node.textContent && node.textContent.includes('LEVEL UP')) {
      node.remove();
    }
  });
});

// Function to update the level progress circles and bar
function updateLevelProgress(percent) {
  // Update the level progress circles
  const levelCircleProgress = document.getElementById("levelCircleProgress");
  const userLevelProgress = document.getElementById("userLevelProgress");
  
  if (levelCircleProgress) {
    levelCircleProgress.style.setProperty('--progress', `${percent}%`);
  }
  
  if (userLevelProgress) {
    userLevelProgress.style.setProperty('--progress', `${percent}%`);
  }
  
  // Update the horizontal progress bar
  const levelProgressBar = document.getElementById("levelProgressBar");
  if (levelProgressBar) {
    levelProgressBar.style.width = `${percent}%`;
  }
}

// Update user XP display function call
window.addEventListener('load', function() {
  // Call after Firebase auth is initialized
  setTimeout(() => {
    if (auth && auth.currentUser) {
      if (typeof updateUserXP === 'function') {
        updateUserXP();
      } else if (typeof window.updateUserXP === 'function') {
        window.updateUserXP();
      }
    }
  }, 2000);
});

// Function to check if a user's streak should be reset due to inactivity
async function checkAndUpdateStreak() {
  if (!auth || !auth.currentUser) {
    console.log("User not authenticated yet");
    return;
  }
  
  try {
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      if (!userDoc.exists()) return;
      
      const data = userDoc.data();
      if (!data.streaks || !data.streaks.lastAnsweredDate) return;
      
      const currentDate = new Date();
      const lastDate = new Date(data.streaks.lastAnsweredDate);
      
      // Normalize dates to remove time component
      const normalizeDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const normalizedCurrent = normalizeDate(currentDate);
      const normalizedLast = normalizeDate(lastDate);
      
      // Calculate difference in days
      const diffDays = Math.round((normalizedCurrent - normalizedLast) / (1000 * 60 * 60 * 24));
      
      // If more than 1 day has passed, reset the streak
      if (diffDays > 1) {
        console.log("Streak reset due to inactivity. Days since last activity:", diffDays);
        data.streaks.currentStreak = 0;
        transaction.set(userDocRef, data, { merge: true });
        
        // Update UI to show reset streak
        const currentStreakElement = document.getElementById("currentStreak");
        if (currentStreakElement) {
          currentStreakElement.textContent = "0";
        }
      }
    });
  } catch (error) {
    console.error("Error checking streak:", error);
  }
}

// Function to load leaderboard preview data - fixed for desktop view
async function loadLeaderboardPreview() {
  if (!auth || !auth.currentUser || !db) {
    console.log("Auth or DB not initialized for leaderboard preview");
    return;
  }
  
  const leaderboardPreview = document.getElementById("leaderboardPreview");
  if (!leaderboardPreview) return;
  
  // Check if user is anonymous (guest)
  const isAnonymous = auth.currentUser.isAnonymous;
  
  // For guest users, show registration prompt instead of leaderboard
  if (isAnonymous) {
    leaderboardPreview.innerHTML = `
      <div class="guest-analytics-prompt">
        <p>Leaderboards are only available for registered users.</p>
        <p>Create a free account to compete with others!</p>
        <button id="registerForLeaderboardBtn" class="start-quiz-btn">Create Free Account</button>
      </div>
    `;
    
    // Add event listener for registration button
    const registerBtn = document.getElementById('registerForLeaderboardBtn');
    if (registerBtn) {
      registerBtn.addEventListener('click', function() {
        if (typeof window.showRegistrationBenefitsModal === 'function') {
          window.showRegistrationBenefitsModal();
        } else if (typeof window.showRegisterForm === 'function') {
          window.showRegisterForm();
        }
      });
    }
    
    // Also modify the card footer to reflect guest status
    const cardFooter = document.querySelector("#leaderboardPreviewCard .card-footer");
    if (cardFooter) {
      cardFooter.innerHTML = `
        <span>Register to Access</span>
        <span class="arrow-icon">→</span>
      `;
    }
    
    return;
  }
  
   // For registered users, continue with normal leaderboard preview
  try {
    const currentUid = auth.currentUser.uid;
    const querySnapshot = await getDocs(collection(db, 'users'));
    let leaderboardEntries = [];
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      // Only include EXPLICITLY registered users
      if (data.stats && data.isRegistered === true) {
        // Use total XP instead of weekly XP calculation
        let xp = data.stats.xp || 0;
        
        // Add user to leaderboard entries with their total XP
        leaderboardEntries.push({
          uid: docSnap.id,
          username: data.username || "Anonymous",
          xp: xp
        });
      }
    });
    
    // Sort by XP (descending)
    leaderboardEntries.sort((a, b) => b.xp - a.xp);
    
    // Get top 3
    let top3 = leaderboardEntries.slice(0, 3);
    
    // Find current user's position if not in top 3
    let currentUserRank = leaderboardEntries.findIndex(e => e.uid === currentUid) + 1;
    let currentUserEntry = leaderboardEntries.find(e => e.uid === currentUid);
    let showCurrentUser = currentUserRank > 3 && currentUserEntry;
    
    // Create HTML for the preview with well-structured entries
    let html = '';
    
    // Add top 3 entries
    if (top3.length === 0) {
      html = '<div class="leaderboard-loading">No leaderboard data yet</div>';
    } else {
      top3.forEach((entry, index) => {
        const isCurrentUser = entry.uid === currentUid;
        const rank = index + 1;
        
        html += `
          <div class="leaderboard-preview-entry ${isCurrentUser ? 'current-user-entry' : ''}">
            <div class="leaderboard-rank leaderboard-rank-${rank}">${rank}</div>
            <div class="leaderboard-user-info">
              <div class="leaderboard-username">${entry.username}</div>
              <div class="leaderboard-user-xp">${entry.xp} XP</div>
            </div>
          </div>
        `;
      });
      
      // Add current user's entry if not in top 3
      if (showCurrentUser) {
        html += `
          <div class="leaderboard-preview-entry current-user-entry">
            <div class="leaderboard-rank">${currentUserRank}</div>
            <div class="leaderboard-user-info">
              <div class="leaderboard-username">${currentUserEntry.username} (You)</div>
              <div class="leaderboard-user-xp">${currentUserEntry.xp} XP</div>
            </div>
          </div>
        `;
      }
    }
    
    leaderboardPreview.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading leaderboard preview:", error);
    leaderboardPreview.innerHTML = '<div class="leaderboard-loading">Error loading leaderboard</div>';
  }
}

// Dashboard initialization and functionality
async function initializeDashboard() {
  if (!auth || !auth.currentUser || !db) {
    console.log("Auth or DB not initialized for dashboard");
    setTimeout(initializeDashboard, 1000);
    return;
  }
  
  try {
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      const stats = data.stats || {};
      const streaks = data.streaks || { currentStreak: 0 };
      
      // Update level and XP display
      const xp = stats.xp || 0;
      const level = stats.level || 1;
      const progress = calculateLevelProgress(xp);
      
      // Set level number
      const dashboardLevel = document.getElementById("dashboardLevel");
      if (dashboardLevel) {
        dashboardLevel.textContent = level;
      }
      
      // Set XP display
      const dashboardXP = document.getElementById("dashboardXP");
      if (dashboardXP) {
        dashboardXP.textContent = `${xp} XP`;
      }
      
      // Set next level info
      const dashboardNextLevel = document.getElementById("dashboardNextLevel");
      if (dashboardNextLevel) {
        const levelInfo = getLevelInfo(level);
        if (levelInfo.nextLevelXp) {
          const xpNeeded = levelInfo.nextLevelXp - xp;
          dashboardNextLevel.textContent = `${xpNeeded} XP to Level ${level + 1}`;
        } else {
          dashboardNextLevel.textContent = 'Max Level Reached!';
        }
      }
      
      // Update progress circle
      const dashboardLevelProgress = document.getElementById("dashboardLevelProgress");
      if (dashboardLevelProgress) {
        dashboardLevelProgress.style.setProperty('--progress', `${progress}%`);
      }
      
      // Update quick stats
      const totalAnswered = stats.totalAnswered || 0;
      const totalCorrect = stats.totalCorrect || 0;
      const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
      
      const dashboardAnswered = document.getElementById("dashboardAnswered");
      if (dashboardAnswered) {
        dashboardAnswered.textContent = totalAnswered;
      }
      
      const dashboardAccuracy = document.getElementById("dashboardAccuracy");
      if (dashboardAccuracy) {
        dashboardAccuracy.textContent = `${accuracy}%`;
      }
      
      // Update streak display
      const currentStreak = document.getElementById("currentStreak");
      if (currentStreak) {
        currentStreak.textContent = streaks.currentStreak || 0;
      }
      
      // Generate streak calendar
      fixStreakCalendar(data.streaks);
      
      // Also load leaderboard preview
      loadLeaderboardPreview();

      // Also load review queue data
      updateReviewQueue();
          // --- START: Logic for Dashboard CME Card ---
    const dashboardCmeCard = document.getElementById("dashboardCmeCard");
    const dashboardCmeAnswered = document.getElementById("dashboardCmeAnswered");
    const dashboardCmeAccuracy = document.getElementById("dashboardCmeAccuracy");
    const dashboardCmeAvailable = document.getElementById("dashboardCmeAvailable");

    // Check if the user is registered (not anonymous)
    const isRegisteredUser = auth.currentUser && !auth.currentUser.isAnonymous;

    if (isRegisteredUser && dashboardCmeCard && dashboardCmeAnswered && dashboardCmeAccuracy && dashboardCmeAvailable) {
        // User is registered, try to show the card and load data
        const cmeStats = data.cmeStats || { // Get CME stats, default to zeros
            totalAnswered: 0,
            totalCorrect: 0,
            creditsEarned: 0.00,
            creditsClaimed: 0.00
        };

        // Calculate values needed for the card
        const uniqueAnswered = cmeStats.totalAnswered || 0;
        const uniqueCorrect = cmeStats.totalCorrect || 0;
        const uniqueAccuracy = uniqueAnswered > 0 ? Math.round((uniqueCorrect / uniqueAnswered) * 100) : 0;
        const creditsEarned = parseFloat(cmeStats.creditsEarned || 0);
        const creditsClaimed = parseFloat(cmeStats.creditsClaimed || 0);
        const availableCredits = Math.max(0, creditsEarned - creditsClaimed).toFixed(2); // Format to 2 decimal places

        // Update the card's content
        dashboardCmeAnswered.textContent = uniqueAnswered;
        dashboardCmeAccuracy.textContent = `${uniqueAccuracy}%`;
        dashboardCmeAvailable.textContent = availableCredits;

        // Make the card visible
        dashboardCmeCard.style.display = "block"; // Or "flex" depending on your CSS for dashboard-card

        console.log("Displayed CME card on dashboard for registered user.");

                // --- START: Add Click Listener for Dashboard CME Card ---
        // First, remove any potentially existing listener to prevent duplicates if dashboard re-initializes
        const newCard = dashboardCmeCard.cloneNode(true); // Clone the card
        dashboardCmeCard.parentNode.replaceChild(newCard, dashboardCmeCard); // Replace old card with clone

        // Add listener to the new card (the clone)
        newCard.addEventListener('click', async () => {
            console.log("Dashboard CME card clicked.");

            // Show a temporary loading state (optional, but good UX)
            newCard.style.opacity = '0.7';
            newCard.style.cursor = 'wait';

            try {
                // Check subscription status (ensure function is available)
                if (typeof checkUserCmeSubscriptionStatus === 'function') {
                    const isSubscribed = await checkUserCmeSubscriptionStatus();
                    console.log("User CME subscription status:", isSubscribed);

                    if (isSubscribed) {
                        // User IS subscribed - go to CME Dashboard
                        if (typeof showCmeDashboard === 'function') {
                            showCmeDashboard();
                        } else {
                            console.error("showCmeDashboard function not found!");
                            alert("Error navigating to CME module.");
                        }
                    } else {
                        // User is NOT subscribed - go to Info/Paywall screen
                        if (typeof showCmeInfoScreen === 'function') {
                            showCmeInfoScreen();
                        } else {
                            console.error("showCmeInfoScreen function not found!");
                            alert("Error showing CME information.");
                        }
                    }
                } else {
                     console.error("checkUserCmeSubscriptionStatus function not found!");
                     alert("Error checking subscription status.");
                }
            } catch (error) {
                console.error("Error during CME card click handling:", error);
                alert("An error occurred. Please try again.");
            } finally {
                // Remove loading state
                newCard.style.opacity = '1';
                newCard.style.cursor = 'pointer';
            }
        });
        // --- END: Add Click Listener for Dashboard CME Card ---

    } else if (dashboardCmeCard) {
        // User is anonymous or elements not found, ensure card is hidden
        dashboardCmeCard.style.display = "none";
        console.log("Hiding CME card on dashboard (user is anonymous or elements missing).");
    }
    // --- END: Logic for Dashboard CME Card ---

  } // End of if (userDocSnap.exists())
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// --- Function to Show CME Claim History Modal ---
async function showCmeHistoryModal() {
  console.log("Executing showCmeHistoryModal...");

  const historyModal = document.getElementById("cmeHistoryModal");
  const historyBody = document.getElementById("cmeHistoryModalBody");
  const closeButton = historyModal ? historyModal.querySelector('.close-modal') : null;

  if (!historyModal || !historyBody || !closeButton) {
      console.error("CME History Modal elements not found!");
      return;
  }

  // 1. Check Authentication
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
      alert("Please log in to view your CME claim history.");
      return;
  }
  const uid = auth.currentUser.uid;

  // 2. Show Modal & Loading State
  historyBody.innerHTML = "<p>Loading history...</p>"; // Set loading message
  historyModal.style.display = "flex"; // Show the modal

  // 3. Add Close Logic (ensure it works)
  // Using onclick assignment here for simplicity, ensures only one listener
  closeButton.onclick = () => {
      historyModal.style.display = "none";
  };
  historyModal.onclick = (event) => {
      if (event.target === historyModal) { // Clicked on background overlay
          historyModal.style.display = "none";
      }
  };

  // 4. Fetch Data from Firestore
  try {
      const userDocRef = doc(db, 'users', uid);
      console.log(`Fetching history for user: ${uid}`);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          // Get history, default to empty array if null/undefined
          const cmeHistory = userData.cmeClaimHistory || [];
          console.log(`Fetched ${cmeHistory.length} history entries.`);

          // 5. Generate HTML Table
          if (cmeHistory.length > 0) {
              // Sort history by timestamp, newest first
              cmeHistory.sort((a, b) => {
                  const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
                  const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
                  return dateB - dateA; // Descending order
              });

              let tableHtml = `
                  <table>
                      <thead>
                          <tr>
                              <th>Date Claimed</th>
                              <th>Credits</th>
                              <th>Certificate</th>
                          </tr>
                      </thead>
                      <tbody>
              `;

              cmeHistory.forEach(claim => {
                  const credits = parseFloat(claim.creditsClaimed || 0).toFixed(2);
                  let claimDate = 'Invalid Date';
                  // Handle both Firestore Timestamp and potential Date objects
                  if (claim.timestamp) {
                       try {
                           const dateObj = claim.timestamp.toDate ? claim.timestamp.toDate() : new Date(claim.timestamp);
                           if (!isNaN(dateObj)) { // Check if date is valid
                                claimDate = dateObj.toLocaleDateString(); // Format as MM/DD/YYYY (or locale default)
                           }
                       } catch (dateError) {
                           console.error("Error parsing date from history:", claim.timestamp, dateError);
                       }
                  }


                  // Create download link/button if URL exists
                  let downloadCellContent = '-'; // Default if no URL
                  if (claim.downloadUrl) {
                      const fileName = claim.pdfFileName || 'CME_Certificate.pdf';
                      downloadCellContent = `
                          <a href="${claim.downloadUrl}"
                             target="_blank"
                             download="${fileName}"
                             class="cme-history-download-btn"
                             title="Download ${fileName}">
                              ⬇️ PDF
                          </a>`;
                  }

                  tableHtml += `
                      <tr>
                          <td>${claimDate}</td>
                          <td>${credits}</td>
                          <td>${downloadCellContent}</td>
                      </tr>
                  `;
              });

              tableHtml += `
                      </tbody>
                  </table>
              `;
              historyBody.innerHTML = tableHtml; // Inject the table

          } else {
              // No history found
              historyBody.innerHTML = `<p class="no-history-message">No CME claim history found.</p>`;
          }

      } else {
          // User document doesn't exist
          console.warn(`User document not found for UID: ${uid} when fetching history.`);
          historyBody.innerHTML = `<p class="no-history-message">Could not find user data.</p>`;
      }

  } catch (error) {
      console.error("Error fetching or displaying CME history:", error);
      historyBody.innerHTML = `<p style="color: red; text-align: center;">Error loading history. Please try again.</p>`;
  }
}
// --- End of showCmeHistoryModal Function ---

// Function to count questions due for review today
async function countDueReviews() {
  if (!auth || !auth.currentUser || !db) {
    console.log("Auth or DB not initialized for counting reviews");
    return { dueCount: 0, nextReviewDate: null };
  }
  
  try {
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      return { dueCount: 0, nextReviewDate: null };
    }
    
    const data = userDocSnap.data();
    const spacedRepetitionData = data.spacedRepetition || {};
    
    // Get current date (just the date portion, no time)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Create tomorrow's date
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    let dueCount = 0;
    let nextReviewDate = null;
    
    // Loop through all questions in spaced repetition data
    for (const questionId in spacedRepetitionData) {
      const reviewData = spacedRepetitionData[questionId];
      if (!reviewData || !reviewData.nextReviewDate) continue;
      
      const reviewDate = new Date(reviewData.nextReviewDate);
      
      // Check if review date is today or earlier by comparing just the date portions
      const reviewDateOnly = new Date(reviewDate.getFullYear(), reviewDate.getMonth(), reviewDate.getDate());
      
      if (reviewDateOnly <= today) {
        dueCount++;
      } 
      // Only consider dates AFTER today for "next review date"
      else if (reviewDateOnly >= tomorrow && (!nextReviewDate || reviewDateOnly < nextReviewDate)) {
        nextReviewDate = reviewDateOnly;
      }
    }
    
    return { dueCount, nextReviewDate };
  } catch (error) {
    console.error("Error counting due reviews:", error);
    return { dueCount: 0, nextReviewDate: null };
  }
}

// Function to update the Review Queue card in the dashboard
async function updateReviewQueue() {
  const reviewCount = document.getElementById("reviewCount");
  const reviewQueueContent = document.getElementById("reviewQueueContent");
  const reviewProgressBar = document.getElementById("reviewProgressBar");
  
  if (!reviewCount || !reviewQueueContent || !reviewProgressBar) return;
  
  // Check if user is anonymous/guest
  const isAnonymous = auth && auth.currentUser && auth.currentUser.isAnonymous;
  
  if (isAnonymous) {
    // Guest user - show registration prompt
    reviewQueueContent.innerHTML = `
      <div class="review-empty-state guest-analytics-prompt">
        <p>Spaced repetition review is available for registered users only.</p>
        <p>Create a free account to unlock this feature!</p>
      </div>
    `;
    reviewCount.textContent = "0";
    reviewProgressBar.style.width = "0%";
    
    const footerText = document.querySelector("#reviewQueueCard .card-footer span:first-child");
    if (footerText) {
      footerText.textContent = "Register to Access";
    }
    return;
  }
  
  // Registered user logic
  try {
    const { dueCount, nextReviewDate } = await countDueReviews();
    
    // Update count and progress bar
    reviewCount.textContent = dueCount;
    const progressPercent = Math.min(100, (dueCount / 20) * 100);
    reviewProgressBar.style.width = `${progressPercent}%`;
    
    // Update content based on due count
    if (dueCount > 0) {
      reviewQueueContent.innerHTML = `
        <div class="review-stats">
          <div class="review-count">${dueCount}</div>
          <div class="review-label">questions due for review</div>
        </div>
        <div class="review-progress-container">
          <div class="review-progress-bar" style="width: ${progressPercent}%"></div>
        </div>
      `;
    } else {
      reviewQueueContent.innerHTML = `
        <div class="review-empty-state">
          <p>No questions due for review today.</p>
          ${nextReviewDate ? 
            `<p>Next scheduled review: <span class="next-review-date">${nextReviewDate.toLocaleDateString()}</span></p>` : 
            '<p>Complete more quizzes to start your spaced repetition journey.</p>'
          }
        </div>
      `;
    }
    
    // Ensure the footer shows 'Start Review'
    const footerText = document.querySelector("#reviewQueueCard .card-footer span:first-child");
    if (footerText) {
      footerText.textContent = "Start Review";
    }
  } catch (error) {
    console.error("Error updating review queue:", error);
    reviewQueueContent.innerHTML = `
      <div class="review-empty-state">
        <p>Error loading review queue</p>
      </div>
    `;
    reviewCount.textContent = "0";
    reviewProgressBar.style.width = "0%";
  }
}

// Set up event listeners for dashboard
function setupDashboardEvents() {
  // Start Quiz button
const startQuizBtn = document.getElementById("startQuizBtn");
if (startQuizBtn) {
  startQuizBtn.addEventListener("click", function() {
    // Check if user is anonymous before showing the modal
    const isAnonymous = auth && auth.currentUser && auth.currentUser.isAnonymous;
    
    // Show or hide the spaced repetition option based on user status
    const spacedRepetitionContainer = document.querySelector('#modalSpacedRepetition').closest('.formGroup');
    if (spacedRepetitionContainer) {
      if (isAnonymous) {
        // Hide the option for guest users
        spacedRepetitionContainer.style.display = 'none';
        // Make sure checkbox is unchecked for guest users
        document.getElementById('modalSpacedRepetition').checked = false;
      } else {
        // Show the option for registered users
        spacedRepetitionContainer.style.display = 'block';
      }
    }
    
    // Show the modal
    document.getElementById("quizSetupModal").style.display = "block";
  });
}
  
  // Modal Start Quiz button
  const modalStartQuiz = document.getElementById("modalStartQuiz");
  if (modalStartQuiz) {
    modalStartQuiz.addEventListener("click", function() {
      const category = document.getElementById("modalCategorySelect").value;
      const numQuestions = parseInt(document.getElementById("modalNumQuestions").value) || 10;
      const includeAnswered = document.getElementById("modalIncludeAnswered").checked;
      
      document.getElementById("quizSetupModal").style.display = "none";

      // Update this part to include the spaced repetition option
      const useSpacedRepetition = document.getElementById("modalSpacedRepetition").checked;
      
      loadQuestions({
        type: category ? 'custom' : 'random',
        category: category,
        num: numQuestions,
        includeAnswered: includeAnswered,
        spacedRepetition: useSpacedRepetition
      });
    });
  }
  
  // Modal Cancel button
  const modalCancelQuiz = document.getElementById("modalCancelQuiz");
  if (modalCancelQuiz) {
    modalCancelQuiz.addEventListener("click", function() {
      document.getElementById("quizSetupModal").style.display = "none";
    });
  }
  
  // User Progress card click - go to Performance
  const userProgressCard = document.getElementById("userProgressCard");
  if (userProgressCard) {
    userProgressCard.addEventListener("click", function() {
      window.displayPerformance(); 
    });
  }
  
  // Quick Stats card click - go to Performance
  const quickStatsCard = document.getElementById("quickStatsCard");
  if (quickStatsCard) {
    quickStatsCard.addEventListener("click", function() {
      window.displayPerformance(); 
    });
  }
  
// Leaderboard Preview Card click - go to Leaderboard
const leaderboardPreviewCard = document.getElementById("leaderboardPreviewCard");
if (leaderboardPreviewCard) {
    // Add listener directly to the found element
    leaderboardPreviewCard.addEventListener('click', function() {
        if (typeof showLeaderboard === 'function') {
            showLeaderboard(); // Call the function to show the leaderboard
        } else {
            console.error("showLeaderboard function not found!");
            alert("Error navigating to leaderboard.");
        }
    });
} else {
     console.warn("Leaderboard Preview Card (#leaderboardPreviewCard) not found in DOM during listener setup.");
}
  
  // Review Queue card click
const reviewQueueCard = document.getElementById("reviewQueueCard");
if (reviewQueueCard) {
  reviewQueueCard.addEventListener("click", async function() {
    // Check if user is anonymous/guest
    const isAnonymous = auth && auth.currentUser && auth.currentUser.isAnonymous;
    
    if (isAnonymous) {
      console.log("Guest user attempted to access review queue");
      
      // Show registration benefits modal for guest users
      if (typeof window.showRegistrationBenefitsModal === 'function') {
        window.showRegistrationBenefitsModal();
      } else {
        // Fallback if function isn't available
        alert("Spaced repetition review is available for registered users only. Please create a free account to access this feature.");
      }
      
      return;
    }
    
    // Original functionality for registered users continues below
    // Get count of due reviews
    const { dueCount } = await countDueReviews();
    
    if (dueCount === 0) {
      alert("You have no questions due for review today. Good job!");
      return;
    }
    
    // We need to get the actual due question IDs
    const dueQuestionIds = await getDueQuestionIds();
    
    if (dueQuestionIds.length === 0) {
      alert("No questions found for review. Please try again later.");
      return;
    }
    
    // Load ONLY the specific due questions, not mixed with new questions
    loadSpecificQuestions(dueQuestionIds);
  });
}
}

// Function to fix streak calendar alignment
function fixStreakCalendar(streaks) {
  // Get the streak calendar element
  const streakCalendar = document.getElementById("streakCalendar");
  if (!streakCalendar) {
    console.error("Streak calendar element not found");
    return;
  }
  
  // Clear existing circles
  streakCalendar.innerHTML = '';
  
  // Get today's date
  const today = new Date();
  
  // Convert JavaScript's day (0=Sunday, 6=Saturday) to our display format (0=Monday, 6=Sunday)
  let todayDayIndex = today.getDay() - 1; // Convert from JS day to our index
  if (todayDayIndex < 0) todayDayIndex = 6; // Handle Sunday (becomes 6)
  
  console.log("Today:", today);
  console.log("Day of week (0=Sun, 6=Sat):", today.getDay());
  console.log("Our day index (0=Mon, 6=Sun):", todayDayIndex);
  
  // Generate all the days of the week
  for (let i = 0; i < 7; i++) {
    // Calculate the date offset from today
    // i is the position in our display (0=Monday, 6=Sunday)
    // todayDayIndex is today's position in our display
    const offset = i - todayDayIndex;
    
    // Create the date for this position
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    
    // Create the day circle
    const dayCircle = document.createElement("div");
    dayCircle.className = "day-circle";
    
    // If this is today, add the today class
    if (offset === 0) {
      dayCircle.classList.add("today");
    }
    
    // Check if this day is active in the streak
    if (streaks && streaks.currentStreak > 0) {
      const dayDiff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      if (dayDiff >= 0 && dayDiff < streaks.currentStreak) {
        dayCircle.classList.add("active");
      }
    }
    
    // Set the date number as the content
    dayCircle.textContent = date.getDate();
    
    // Add to the calendar
    streakCalendar.appendChild(dayCircle);
  }
}

// Initialize the app
window.addEventListener('load', function() {
  // Check streak after Firebase auth is initialized
  const checkAuthAndInitAll = function() {
    if (auth && auth.currentUser) {
      checkAndUpdateStreak();
      setupDashboardEvents();
      initializeDashboard();
    } else {
      // If auth isn't ready yet, check again in 1 second
      setTimeout(checkAuthAndInitAll, 1000);
    }
  };
  
  // Start checking for auth
  checkAuthAndInitAll();
  
  // Also try after a delay to ensure all DOM elements are ready
  setTimeout(function() {
    setupDashboardEvents();
    initializeDashboard();
  }, 2000);
});

// Function to get IDs of questions due for review
async function getDueQuestionIds() {
  if (!auth || !auth.currentUser || !db) {
    return [];
  }
  
  try {
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      return [];
    }
    
    const data = userDocSnap.data();
    const spacedRepetitionData = data.spacedRepetition || {};
    
    // Get current date (just the date portion, no time)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let dueQuestionIds = [];
    
    // Loop through all questions in spaced repetition data
    for (const questionId in spacedRepetitionData) {
      const reviewData = spacedRepetitionData[questionId];
      if (!reviewData || !reviewData.nextReviewDate) continue;
      
      const reviewDate = new Date(reviewData.nextReviewDate);
      
      // Check if review date is today or earlier by comparing just the date portions
      const reviewDateOnly = new Date(reviewDate.getFullYear(), reviewDate.getMonth(), reviewDate.getDate());
      
      if (reviewDateOnly <= today) {
        dueQuestionIds.push(questionId);
      }
    }
    
    return dueQuestionIds;
  } catch (error) {
    console.error("Error getting due question IDs:", error);
    return [];
  }
}

// NEW version - uses fetchQuestionBank (Firestore)
async function loadSpecificQuestions(questionIds) {
  if (!questionIds || questionIds.length === 0) {
    alert("No questions to review.");
    return;
  }
  console.log("Loading specific review questions:", questionIds.length);

  try {
    // 1. Fetch the entire question bank from Firestore
    // Ensure fetchQuestionBank is imported from quiz.js at the top of app.js
    console.log("Fetching full question bank from Firestore for review queue...");
    const allQuestions = await fetchQuestionBank(); // Uses the updated function from quiz.js
    console.log("Full question bank loaded:", allQuestions.length);

    // 2. Filter the fetched questions based on the provided IDs
    const reviewQuestions = allQuestions.filter(q => {
      // Ensure the question object and the 'Question' field exist before trimming
      const questionText = q && q["Question"] ? q["Question"].trim() : null;
      return questionText && questionIds.includes(questionText);
    });
    console.log("Filtered review questions:", reviewQuestions.length);

    // 3. Handle cases where no matching questions are found
    if (reviewQuestions.length === 0) {
      alert("Could not find the specific questions scheduled for review. They might have been updated or removed from the question bank.");
      // Optionally, navigate back to the dashboard or show a message
      document.getElementById("mainOptions").style.display = "flex"; // Example fallback
      return;
    }

    // 4. Shuffle the review questions
    const shuffledReviewQuestions = shuffleArray([...reviewQuestions]);

    // 5. Initialize the quiz with only these specific review questions
    // Ensure initializeQuiz is imported from quiz.js at the top of app.js
    initializeQuiz(shuffledReviewQuestions); // Pass the filtered & shuffled questions

  } catch (error) {
    console.error("Error loading specific questions for review:", error);
    alert("Error loading review questions. Please try again later.");
    // Optionally, navigate back or show an error message
    document.getElementById("mainOptions").style.display = "flex"; // Example fallback
  }
}

// Then call this function when showing the dashboard after auth
// in the auth state change listener

function ensureEventListenersAttached() {
  // This function makes sure key event listeners are attached
  // Call this whenever dashboard is shown
  
  // Start Quiz button
  const startQuizBtn = document.getElementById("startQuizBtn");
  if (startQuizBtn && !startQuizBtn._hasEventListener) {
    startQuizBtn.addEventListener("click", function() {
      document.getElementById("quizSetupModal").style.display = "block";
    });
    startQuizBtn._hasEventListener = true;
  }
  
  // Check other important buttons
  setupDashboardEvents();
}

// Update the forceReinitializeDashboard function to call clearDebugStyles
function forceReinitializeDashboard() {
  console.log("Force reinitializing dashboard...");
  
  // First ensure all screens are properly hidden
  ensureAllScreensHidden();
  
  // IMPORTANT: Reset all user data displays based on current auth state
  const isAnonymous = auth.currentUser && auth.currentUser.isAnonymous;
  if (isAnonymous) {
    // For anonymous users, ensure stats display 0/blank
    cleanupOnLogout();
  } else {
    // For registered users, refresh displays from database
    if (typeof updateUserXP === 'function') {
      updateUserXP();
    }
    if (typeof updateUserMenu === 'function') {
      updateUserMenu();
    }
  }
  
  // 1. Check for any overlays that might be active and remove them
  const menuOverlay = document.getElementById("menuOverlay");
  if (menuOverlay) {
    menuOverlay.classList.remove("show");
    menuOverlay.style.zIndex = "1599"; // Ensure correct z-index
  }
  
  // 2. Force a redraw/layout recalculation of the dashboard
  const mainOptions = document.getElementById("mainOptions");
  if (mainOptions) {
    // Make sure the mainOptions has a lower z-index than any potential overlays
    mainOptions.style.zIndex = "1";
    mainOptions.style.position = "relative";
    
    // Temporarily hide and show to force a repaint
    const display = mainOptions.style.display;
    mainOptions.style.display = 'none';
    
    // Use a timeout to ensure the browser processes the display change
    setTimeout(() => {
      mainOptions.style.display = display || 'flex';
      
      console.log("Dashboard redraw complete, attaching event listeners...");
      
      // 4. Reattach all event listeners
      setTimeout(() => {
        setupDashboardEventListenersExplicitly();
        
        // Debug overlays after setup is complete
        setTimeout(() => {
          debugOverlays();
          
          // Clear debugging styles after we've seen the debug output
          setTimeout(clearDebugStyles, 500);
        }, 200);
      }, 50);
    }, 50);
  }
}

// Create a more robust function that explicitly attaches all needed listeners
function setupDashboardEventListenersExplicitly() {
  // Start Quiz Button
  const startQuizBtn = document.getElementById("startQuizBtn");
  if (startQuizBtn) {
    console.log("Found Start Quiz button, attaching listener");
    // Remove any existing listeners by cloning and replacing the element
    const newBtn = startQuizBtn.cloneNode(true);
    startQuizBtn.parentNode.replaceChild(newBtn, startQuizBtn);
    
    // Add the event listener to the new element
    newBtn.addEventListener("click", function(e) {
      console.log("Start Quiz button clicked");
      const quizSetupModal = document.getElementById("quizSetupModal");
      if (quizSetupModal) {
        quizSetupModal.style.display = "block";
      }
    });
  } else {
    console.warn("Start Quiz button not found in DOM");
  }
  
  // User Progress Card
  const userProgressCard = document.getElementById("userProgressCard");
  if (userProgressCard) {
    console.log("Found User Progress card, attaching listener");
    const newCard = userProgressCard.cloneNode(true);
    userProgressCard.parentNode.replaceChild(newCard, userProgressCard);
    newCard.addEventListener("click", function() {
      console.log("User Progress card clicked");
      if (typeof displayPerformance === 'function') {
        window.displayPerformance(); 
      }
    });
  }
  
  // Quick Stats Card
  const quickStatsCard = document.getElementById("quickStatsCard");
  if (quickStatsCard) {
    console.log("Found Quick Stats card, attaching listener");
    const newCard = quickStatsCard.cloneNode(true);
    quickStatsCard.parentNode.replaceChild(newCard, quickStatsCard);
    newCard.addEventListener("click", function() {
      console.log("Quick Stats card clicked");
      if (typeof displayPerformance === 'function') {
        window.displayPerformance(); 
      }
    });
  }
  
  // Leaderboard Preview Card
  const leaderboardPreviewCard = document.getElementById("leaderboardPreviewCard");
  if (leaderboardPreviewCard) {
    console.log("Found Leaderboard Preview card, attaching listener");
    const newCard = leaderboardPreviewCard.cloneNode(true);
    leaderboardPreviewCard.parentNode.replaceChild(newCard, leaderboardPreviewCard);
    newCard.addEventListener("click", function() {
      console.log("Leaderboard Preview card clicked");
      if (typeof showLeaderboard === 'function') {
        showLeaderboard();
      }
    });
  }
  
  // Review Queue Card
  const reviewQueueCard = document.getElementById("reviewQueueCard");
  if (reviewQueueCard) {
    console.log("Found Review Queue card, attaching listener");
    const newCard = reviewQueueCard.cloneNode(true);
    reviewQueueCard.parentNode.replaceChild(newCard, reviewQueueCard);
    newCard.addEventListener("click", function() {
      console.log("Review Queue card clicked");
      if (typeof getDueQuestionIds === 'function') {
        getDueQuestionIds().then(dueQuestionIds => {
          if (dueQuestionIds.length === 0) {
            alert("You have no questions due for review today. Good job!");
            return;
          }
          loadSpecificQuestions(dueQuestionIds);
        });
      }
    });
  }
  
  // Menu Button
  const menuToggle = document.getElementById("menuToggle");
  if (menuToggle) {
    console.log("Found Menu Toggle button, attaching listener");
    const newToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(newToggle, menuToggle);
    newToggle.addEventListener("click", function() {
      console.log("Menu Toggle button clicked");
      const sideMenu = document.getElementById("sideMenu");
      const menuOverlay = document.getElementById("menuOverlay");
      
      if (sideMenu) sideMenu.classList.add("open");
      if (menuOverlay) menuOverlay.classList.add("show");
    });
  }
  
  // This adds original setup as well in case we missed anything
  if (typeof setupDashboardEvents === 'function') {
    setupDashboardEvents();
  }
  
  console.log("All dashboard event listeners explicitly attached");
}

// Add this function to app.js
function debugOverlays() {
  console.log("Debugging overlays...");
  
  // Temporary debugging code to highlight overlays
  document.querySelectorAll('*').forEach(el => {
    if (window.getComputedStyle(el).position === 'fixed' && 
        el.id !== 'mainOptions' && 
        !el.classList.contains('toolbar')) {
      el.style.backgroundColor = 'rgba(255,0,0,0.2)';
      console.log('Potential overlay:', el);
    }
  });
  
  // Also debug z-index values
  document.querySelectorAll('*').forEach(el => {
    const zIndex = window.getComputedStyle(el).zIndex;
    if (zIndex !== 'auto' && zIndex > 10) {
      console.log('High z-index element:', el, 'z-index:', zIndex);
    }
  });
}

// Add this function to your app.js to properly hide all screens
function ensureAllScreensHidden(exceptScreenId) {
  console.log(`Ensuring all screens are properly hidden (except: ${exceptScreenId || 'none'})...`);
  
  // Get all potential overlay screens
  const screens = [
    document.getElementById("welcomeScreen"),
    document.getElementById("loginScreen"),
    document.getElementById("splashScreen")
  ];
  
  // Properly hide all screens except the specified one
  screens.forEach(screen => {
    if (screen && screen.id !== exceptScreenId) {
      // Both set display to none AND set opacity to 0
      screen.style.display = 'none';
      screen.style.opacity = '0';
      console.log(`Hiding screen: ${screen.id}`);
    } else if (screen && screen.id === exceptScreenId) {
      console.log(`Keeping screen visible: ${screen.id}`);
    }
  });
}

// Add this function to your app.js
function clearDebugStyles() {
  console.log("Clearing debug background colors...");
  
  // Remove the red background color from all elements
  document.querySelectorAll('*').forEach(el => {
    if (el.style.backgroundColor === 'rgba(255, 0, 0, 0.2)') {
      el.style.backgroundColor = '';
      console.log(`Cleared debug background from: ${el.id || el.tagName}`);
    }
  });
}

// Add this function to your auth.js or app.js file
async function cleanupOnLogout() {
  console.log("Cleaning up after logout...");
  
  // Clear any cached user data in the UI
  const xpDisplays = [
    document.getElementById("xpDisplay"),
    document.getElementById("dashboardXP"),
    document.getElementById("userXpDisplay")
  ];
  
  // Reset XP displays to 0
  xpDisplays.forEach(element => {
    if (element) {
      element.textContent = "0 XP";
    }
  });
  
  // Reset level displays to 1
  const levelDisplays = [
    document.getElementById("scoreCircle"),
    document.getElementById("dashboardLevel"),
    document.getElementById("userScoreCircle")
  ];
  
  levelDisplays.forEach(element => {
    if (element) {
      element.textContent = "1";
    }
  });
  
  // Reset level progress indicators to 0%
  const progressElements = [
    document.getElementById("levelCircleProgress"),
    document.getElementById("dashboardLevelProgress"),
    document.getElementById("userLevelProgress"),
    document.getElementById("levelProgressBar")
  ];
  
  progressElements.forEach(element => {
    if (element) {
      if (element.style.setProperty) {
        element.style.setProperty('--progress', '0%');
      } else {
        element.style.width = '0%';
      }
    }
  });
  
  // Reset other stats displays
  const statsElements = [
    document.getElementById("dashboardAnswered"),
    document.getElementById("dashboardAccuracy"),
    document.getElementById("currentStreak")
  ];
  
  statsElements.forEach((element, index) => {
    if (element) {
      if (index === 1) { // Accuracy needs % symbol
        element.textContent = "0%";
      } else {
        element.textContent = "0";
      }
    }
  });
  
  // Clear any other cached user-specific data
  // This prevents old data from showing up in the UI
  localStorage.removeItem("quizProgress");
  
  console.log("User display data reset completed");
}

// Add event listeners for Terms and Privacy Policy links
document.addEventListener('DOMContentLoaded', function() {
  // Terms of Service link handler
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'registerViewTOS') {
      e.preventDefault();
      document.getElementById('termsOfServiceModal').style.display = 'flex';
    }
    
    // Privacy Policy link handler
    if (e.target && e.target.id === 'registerViewPrivacy') {
      e.preventDefault();
      document.getElementById('privacyPolicyModal').style.display = 'flex';
    }
    
    // Close modal buttons
    if (e.target && e.target.classList.contains('close-modal')) {
      const modal = e.target.closest('.modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }
    
    // Click outside to close
    if (e.target && (e.target.id === 'termsOfServiceModal' || e.target.id === 'privacyPolicyModal')) {
      e.target.style.display = 'none';
    }
  });
  
  // Terms checkbox validation
  const registerForm = document.getElementById('registerForm');
  const agreeTerms = document.getElementById('agreeTerms');
  
  if (registerForm && agreeTerms) {
    registerForm.addEventListener('submit', function(e) {
      if (!agreeTerms.checked) {
        e.preventDefault();
        const termsError = document.getElementById('termsError');
        if (termsError) {
          termsError.textContent = 'You must agree to the Terms of Service and Privacy Policy';
        }
        return false;
      }
    });
  }
});

// Add Forgot Password Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Make sure the modal exists
  ensureForgotPasswordModalExists();
  
  // Add click handler for "Forgot Password" link
  document.addEventListener('click', function(e) {
    // Check if forgot password link was clicked
    if (e.target && e.target.id === 'forgotPasswordLink') {
      e.preventDefault();
      showForgotPasswordModal();
    }
    
    // Handle cancel button click
    if (e.target && e.target.id === 'cancelResetBtn') {
      hideForgotPasswordModal();
    }
  });
  
  // Add submit handler for forgot password form
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', handlePasswordReset);
  }
});

// Make sure the forgot password modal exists in the DOM
function ensureForgotPasswordModalExists() {
  if (!document.getElementById('forgotPasswordModal')) {
    const modal = document.createElement('div');
    modal.id = 'forgotPasswordModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Reset Password</h2>
          <span class="close-modal">&times;</span>
        </div>
        <div class="modal-body">
          <p>Enter your email address below and we'll send you a link to reset your password.</p>
          
          <form id="forgotPasswordForm">
            <div class="form-group">
              <label for="resetEmail">Email Address</label>
              <input type="email" id="resetEmail" required placeholder="Enter your email">
              <div class="form-error" id="resetEmailError"></div>
            </div>
            
            <div class="reset-loader" id="resetLoader"></div>
            <div id="resetMessage" class="reset-message"></div>
            
            <div class="form-buttons">
              <button type="submit" id="sendResetLinkBtn" class="auth-primary-btn">Send Reset Link</button>
              <button type="button" id="cancelResetBtn" class="auth-secondary-btn">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Add close button functionality
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', hideForgotPasswordModal);
    }
    
    // Add click outside to close
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        hideForgotPasswordModal();
      }
    });
  }
}

// Show the forgot password modal
function showForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    // Reset form and messages
    const form = document.getElementById('forgotPasswordForm');
    const resetMessage = document.getElementById('resetMessage');
    const resetEmailError = document.getElementById('resetEmailError');
    
    if (form) form.reset();
    if (resetMessage) resetMessage.textContent = '';
    if (resetMessage) resetMessage.className = 'reset-message';
    if (resetEmailError) resetEmailError.textContent = '';
    
    // Show the modal
    modal.style.display = 'flex';
  }
}

// Hide the forgot password modal
function hideForgotPasswordModal() {
  const modal = document.getElementById('forgotPasswordModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Handle password reset form submission
async function handlePasswordReset(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('resetEmail');
  const resetMessage = document.getElementById('resetMessage');
  const resetEmailError = document.getElementById('resetEmailError');
  const resetLoader = document.getElementById('resetLoader');
  const sendResetLinkBtn = document.getElementById('sendResetLinkBtn');
  const cancelResetBtn = document.getElementById('cancelResetBtn');
  
  // Clear previous messages
  if (resetMessage) resetMessage.textContent = '';
  if (resetMessage) resetMessage.className = 'reset-message';
  if (resetEmailError) resetEmailError.textContent = '';
  
  // Validate email
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) {
    if (resetEmailError) resetEmailError.textContent = 'Please enter your email address';
    return;
  }
  
  // Show loader and disable buttons
  if (resetLoader) resetLoader.style.display = 'block';
  if (sendResetLinkBtn) sendResetLinkBtn.disabled = true;
  if (cancelResetBtn) cancelResetBtn.disabled = true;
  
  try {
    // Send password reset email using Firebase
    await sendPasswordResetEmail(auth, email);
    
    // Show success message
    if (resetMessage) {
      resetMessage.textContent = 'Password reset email sent! Check your inbox and spam folder.';
      resetMessage.className = 'reset-message success';
    }
    
    // Close the modal after 5 seconds
    setTimeout(hideForgotPasswordModal, 5000);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    
    // Show error message
    if (resetMessage) {
      resetMessage.textContent = getResetErrorMessage(error);
      resetMessage.className = 'reset-message error';
    }
  } finally {
    // Hide loader and enable buttons
    if (resetLoader) resetLoader.style.display = 'none';
    if (sendResetLinkBtn) sendResetLinkBtn.disabled = false;
    if (cancelResetBtn) cancelResetBtn.disabled = false;
  }
}

// Get user-friendly error message for password reset
function getResetErrorMessage(error) {
  const errorCode = error.code;
  
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'Invalid email address format';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return error.message || 'An error occurred. Please try again.';
  }
}

// Fix for main login screen
document.addEventListener('DOMContentLoaded', function() {
  // Look for the forgot password link on the main login screen
  const mainLoginForgotPwLink = document.querySelector('#loginScreen a[href="#forgotPassword"]');
  
  if (mainLoginForgotPwLink) {
    // Replace the current click handler with one that uses the actual reset functionality
    mainLoginForgotPwLink.addEventListener('click', function(e) {
      e.preventDefault();
      // Use the existing password reset functionality
      showForgotPasswordModal();
    });
  }
});

// Function to show the registration benefits modal
function showRegistrationBenefitsModal() {
  const modal = document.getElementById('registrationBenefitsModal');
  if (modal) {
    // Reset modal state before showing it
    modal.style.opacity = '1';
    modal.style.zIndex = '9800'; // Ensure high z-index
    modal.style.display = 'flex';
    
    // Clear any previous handlers with completely new buttons
    const createAccountBtn = document.getElementById('createAccountBenefitsBtn');
    const continueAsGuestBtn = document.getElementById('continueAsGuestBtn');
    const closeModal = modal.querySelector('.close-modal');
    
    // Create completely new buttons to eliminate any stale event listeners
    if (createAccountBtn) {
      const newBtn = document.createElement('button');
      newBtn.id = 'createAccountBenefitsBtn';
      newBtn.className = 'auth-primary-btn';
      newBtn.textContent = 'Create Free Account';
      
      createAccountBtn.parentNode.replaceChild(newBtn, createAccountBtn);
      
      newBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        console.log("Create account button clicked");
        modal.style.display = 'none';
        if (typeof showRegisterForm === 'function') {
          showRegisterForm();
        } else if (typeof window.showRegisterForm === 'function') {
          window.showRegisterForm();
        } else {
          console.error("Registration function not found");
        }
      });
    }
    
    if (continueAsGuestBtn) {
      const newBtn = document.createElement('button');
      newBtn.id = 'continueAsGuestBtn';
      newBtn.className = 'auth-secondary-btn';
      newBtn.textContent = 'Continue as Guest';
      
      continueAsGuestBtn.parentNode.replaceChild(newBtn, continueAsGuestBtn);
      
      newBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        console.log("Continue as guest button clicked");
        modal.style.display = 'none';
        // Show the main dashboard and ensure it's visible
        const mainOptions = document.getElementById('mainOptions');
        if (mainOptions) {
          mainOptions.style.display = 'flex';
          mainOptions.style.visibility = 'visible';
          
          // Force reinitialize the dashboard to ensure it's properly displayed
          if (typeof initializeDashboard === 'function') {
            setTimeout(initializeDashboard, 100);
          }
        }
      });
    }
    
    if (closeModal) {
      const newClose = document.createElement('span');
      newClose.className = 'close-modal';
      newClose.innerHTML = '&times;';
      
      closeModal.parentNode.replaceChild(newClose, closeModal);
      
      newClose.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        console.log("Close modal button clicked");
        modal.style.display = 'none';
        // Show the main dashboard
        const mainOptions = document.getElementById('mainOptions');
        if (mainOptions) {
          mainOptions.style.display = 'flex';
        }
      });
    }
    
    // Also add click handler for the modal background
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        console.log("Modal background clicked");
        modal.style.display = 'none';
        // Show the main dashboard
        const mainOptions = document.getElementById('mainOptions');
        if (mainOptions) {
          mainOptions.style.display = 'flex';
        }
      }
    });
  }
}

// Counter for tracking questions answered by guest users
window.guestQuestionsAnswered = 0;

// Function to check if registration prompt should be shown
function checkRegistrationPrompt() {
  // Only show prompts for anonymous users
  if (!auth || !auth.currentUser || !auth.currentUser.isAnonymous) {
    return;
  }
  
  // Increment the counter
  window.guestQuestionsAnswered = (window.guestQuestionsAnswered || 0) + 1;
  
  // Show registration prompt after every 7-8 questions
  if (window.guestQuestionsAnswered % 7 === 0) {
    // Wait a moment before showing the prompt
    setTimeout(() => {
      showRegistrationBenefitsModal();
    }, 1500);
  }
}

// Make functions globally available
window.showRegistrationBenefitsModal = showRegistrationBenefitsModal;
window.checkRegistrationPrompt = checkRegistrationPrompt;

// Direct fix for the "Continue as Guest" button in the registration benefits modal
document.addEventListener('DOMContentLoaded', function() {
  // Add a direct event listener for the button, outside of any function
  function fixContinueAsGuestButton() {
    const continueAsGuestBtn = document.getElementById('continueAsGuestBtn');
    
    if (continueAsGuestBtn) {
      console.log("Found Continue as Guest button, adding direct event listener");
      
      // Remove any existing listeners by cloning
      const newBtn = continueAsGuestBtn.cloneNode(true);
      continueAsGuestBtn.parentNode.replaceChild(newBtn, continueAsGuestBtn);
      
      // Add simple, direct click handler
      newBtn.addEventListener('click', function() {
        console.log("Continue as Guest button clicked");
        
        // Close the modal directly
        const modal = document.getElementById('registrationBenefitsModal');
        if (modal) {
          modal.style.display = 'none';
        }
        
        // Show the main dashboard directly
        const mainOptions = document.getElementById('mainOptions');
        if (mainOptions) {
          mainOptions.style.display = 'flex';
          console.log("Main options displayed");
        }
      });
    }
  }
  
  // Run the fix immediately
  fixContinueAsGuestButton();
  
  // Also run the fix after a delay to catch any later DOM changes
  setTimeout(fixContinueAsGuestButton, 1000);
  
  // Add a failsafe method the user can manually call if needed
  window.fixContinueAsGuestButton = fixContinueAsGuestButton;
});

// --- Step 3: Helper Functions ---

// Placeholder function - replace with your actual logic to check subscription
async function checkUserCmeSubscriptionStatus() {
    console.log("Checking CME subscription status (placeholder)...");
    
    if (window.authState && window.authState.user && !window.authState.user.isAnonymous) { // Ensure user is logged in and not guest
        try {
            const userDocRef = doc(db, 'users', window.authState.user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                // --- Replace this line with your actual check ---
                // Example: Check if a field 'cmeSubscriptionActive' is true
                const isActive = userData.cmeSubscriptionActive === true;
                console.log(`Firestore check: User ${window.authState.user.uid}, cmeSubscriptionActive = ${userData.cmeSubscriptionActive}, Result: ${isActive}`);
                return isActive;
            } else {
                console.log("User document not found for subscription check.");
                return false; // No document, no subscription
            }
        } catch (error) {
            console.error("Error checking subscription status in Firestore:", error);
            return false; // Error occurred, assume no subscription
        }
    } else {
         console.log("User not logged in or is anonymous, cannot check subscription.");
         return false; // Not a registered user, no subscription
    }
}

// Function to show the CME Dashboard and hide others
function showCmeDashboard() {
  console.log("Executing showCmeDashboard..."); // For debugging START

  // Define IDs of all top-level views to hide
  const viewsToHide = [
      "mainOptions",
      "performanceView",
      "leaderboardView",
      "aboutView",
      "faqView",
      "welcomeScreen",
      "splashScreen",
      "loginScreen",
      "onboardingLoadingScreen"
      // Add any other top-level view IDs here
  ];
  // Define IDs of modals/forms to hide
  const modalsToHide = [
      "customQuizForm",
      "randomQuizForm",
      "quizSetupModal",
      "cmeQuizSetupModal", // Added CME setup modal
      "cmeClaimModal",     // Added CME claim modal
      "contactModal",
      "feedbackModal",
      "loginModal",
      "registerModal",
      "forgotPasswordModal",
      "registrationBenefitsModal",
      "termsOfServiceModal",
      "privacyPolicyModal"
      // Add other modal IDs
  ];
  // Define elements related to the quiz interface using querySelector for flexibility
  const quizSelectorsToHide = [
      ".swiper",        // The main quiz container
      "#bottomToolbar", // Quiz progress/score bar
      "#iconBar"        // Favorite/Feedback buttons during quiz
  ];

  // Hide all standard views
  viewsToHide.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
          element.style.display = "none";
          console.log(`Hid view: #${id}`);
      } else {
          // console.warn(`View element with ID #${id} not found.`);
      }
  });

  // Hide all modals
  modalsToHide.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
          element.style.display = "none";
          console.log(`Hid modal: #${id}`);
      } else {
           // console.warn(`Modal element with ID #${id} not found.`);
      }
  });

   // Hide quiz interface elements
   quizSelectorsToHide.forEach(selector => {
      const element = document.querySelector(selector); // Use querySelector
      if (element) {
          element.style.display = "none";
          console.log(`Hid quiz element: ${selector}`);
      } else {
           console.warn(`Quiz element with selector ${selector} not found.`);
      }
  });

  // Show the CME dashboard
  const cmeDashboard = document.getElementById("cmeDashboardView");
  if (cmeDashboard) {
      console.log("Attempting to show #cmeDashboardView...");
      cmeDashboard.style.display = "block"; // Or 'flex' depending on your CSS
      console.log("Set #cmeDashboardView display to 'block'.");
      // Load data AFTER showing the view
      loadCmeDashboardData();
  } else {
      console.error("CRITICAL: CME Dashboard element (#cmeDashboardView) not found.");
  }
  console.log("showCmeDashboard finished."); // For debugging END
}

window.showCmeDashboard = showCmeDashboard; // Make the function globally accessible

// --- Step 12b: Helper Function to Prepare Claim Modal ---

async function prepareClaimModal() {
    console.log("Preparing claim modal...");
    const availableCreditsSpan = document.getElementById("claimModalAvailableCredits");
    const creditsInput = document.getElementById("creditsToClaimInput");
    const errorDiv = document.getElementById("claimModalError");
    const form = document.getElementById("cmeClaimForm");
    const biasCommentDiv = document.getElementById("commercialBiasCommentDiv");
    const biasCommentTextarea = document.getElementById("evalCommercialBiasComment");
    const loadingIndicator = document.getElementById('claimLoadingIndicator');
    const submitButton = document.getElementById('submitCmeClaimBtn');

    // Reset form elements and messages
    if (form) form.reset(); // Clear previous entries
    if (errorDiv) errorDiv.textContent = ''; // Clear errors
    if (biasCommentDiv) biasCommentDiv.style.display = 'none'; // Hide bias comment initially
    if (biasCommentTextarea) biasCommentTextarea.value = ''; // Clear bias comment
    if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loader
    if (submitButton) submitButton.disabled = false; // Ensure submit button is enabled

    // Fetch latest available credits
    let availableCredits = 0.00;
    if (window.authState && window.authState.user && !window.authState.user.isAnonymous) {
        try {
            const uid = window.authState.user.uid;
            const userDocRef = doc(db, 'users', uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const cmeStats = userDocSnap.data().cmeStats || {};
                const earned = parseFloat(cmeStats.creditsEarned || 0);
                const claimed = parseFloat(cmeStats.creditsClaimed || 0);
                availableCredits = Math.max(0, earned - claimed);
            }
        } catch (error) {
            console.error("Error fetching available credits for modal:", error);
            if (errorDiv) errorDiv.textContent = "Error loading available credits.";
        }
    }

    // Update display and input attributes
    const formattedAvailable = availableCredits.toFixed(2);
    if (availableCreditsSpan) {
        availableCreditsSpan.textContent = formattedAvailable;
    }
    if (creditsInput) {
        creditsInput.value = formattedAvailable; // Default input to max available
        creditsInput.max = formattedAvailable; // Set max attribute dynamically
        creditsInput.min = "0.25"; // Ensure min is set
        creditsInput.step = "0.25"; // Ensure step is set
    }

    console.log(`Claim modal prepared. Available credits: ${formattedAvailable}`);
}

// --- End of Step 12b ---
// In app.js

async function handleCmeClaimSubmission(event) {
  event.preventDefault(); // Prevent default form submission
  console.log("CME Claim Form submitted - processing (Firebase Function Version)...");

  // Get elements needed throughout the function
  const errorDiv = document.getElementById("claimModalError");
  const loadingIndicator = document.getElementById('claimLoadingIndicator');
  const submitButton = document.getElementById('submitCmeClaimBtn');
  const cancelButton = document.getElementById('cancelCmeClaimBtn');
  const form = document.getElementById('cmeClaimForm');
  const creditsInput = document.getElementById('creditsToClaimInput');
  const cmeClaimModal = document.getElementById("cmeClaimModal");

  // --- Helper function for cleanup ---
  const cleanup = (enableButtons = true, showLoader = false) => {
      if (loadingIndicator) loadingIndicator.style.display = showLoader ? 'block' : 'none';
      if (submitButton) submitButton.disabled = !enableButtons || showLoader; // Disable if loading or explicitly told
      if (cancelButton) cancelButton.disabled = !enableButtons || showLoader; // Disable if loading or explicitly told
      // Keep buttons visible unless explicitly hiding on final success/error
      if (submitButton) submitButton.style.display = 'inline-block';
      if (cancelButton) cancelButton.style.display = 'inline-block';
  };

  // --- Clear previous errors & Show Loader ---
  if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.color = ''; // Reset styles
      errorDiv.style.border = '';
      errorDiv.style.backgroundColor = '';
      errorDiv.style.padding = '';
      errorDiv.style.borderRadius = '';
      errorDiv.innerHTML = '';
  }
  cleanup(false, true); // Disable buttons, show loader
  if(loadingIndicator) loadingIndicator.querySelector('p').textContent = 'Processing claim...';

  // --- Ensure user is still valid ---
  if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) {
      if (errorDiv) errorDiv.textContent = "Authentication error. Please log in again.";
      cleanup(true, false); // Re-enable buttons, hide loader
      return;
  }
  const uid = auth.currentUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const claimTimestamp = new Date(); // Capture timestamp for potential history update
  const claimTimestampISO = claimTimestamp.toISOString(); // Use ISO string for reliable history matching

  try {
      // --- 1. Get Form Data & Validate ---
      const formData = new FormData(form);
      const creditsToClaim = parseFloat(creditsInput.value);
      const certificateFullName = formData.get('certificateFullName')?.trim() || '';
      // --- Extract Evaluation Data ---
      const evaluationData = {
          certificateFullName: certificateFullName, // Include name here
          objectivesMet: formData.get('evalObjectivesMet'),
          confidence: formData.get('evalConfidence'),
          usefulness: formData.get('evalUsefulness') || 'N/A', // Default if not applicable
          practiceChange: formData.getAll('evalPracticeChange'), // Gets all checked values
          practiceChangeOtherText: formData.get('evalPracticeChangeOtherText')?.trim() || '',
          biasChange: formData.getAll('evalBiasChange'), // Gets all checked values
          biasChangeOtherText: formData.get('evalBiasChangeOtherText')?.trim() || '',
          delivery: formData.get('evalDelivery'),
          commercialBias: formData.get('evalCommercialBias'),
          commercialBiasComment: formData.get('evalCommercialBiasComment')?.trim() || '',
          additionalComments: formData.get('evalAdditionalComments')?.trim() || ''
      };
      // --- End Evaluation Data Extraction ---

      // --- Form Validation ---
      if (!certificateFullName) throw new Error("Please enter your full name.");
      if (isNaN(creditsToClaim) || creditsToClaim <= 0 || creditsToClaim % 0.25 !== 0) {
           throw new Error("Invalid credits amount. Must be positive and in increments of 0.25.");
      }
      if (!evaluationData.objectivesMet || !evaluationData.confidence || !evaluationData.delivery || !evaluationData.commercialBias) {
           throw new Error("Please complete required evaluation questions (1, 2, 6, 7).");
      }
      if (evaluationData.practiceChange.length === 0) {
           throw new Error("Please select at least one Practice Change Area (Question 4).");
      }
      if (evaluationData.biasChange.length === 0) {
           throw new Error("Please select at least one Implicit Bias Change Area (Question 5).");
      }
      if (evaluationData.commercialBias === 'No' && !evaluationData.commercialBiasComment) {
           throw new Error("Please comment if you indicated commercial bias was present (Question 7).");
      }
      // --- End Validation ---


      // --- 2. Firestore Transaction (Save Claim Data AND Deduct Credits) ---
      await runTransaction(db, async (transaction) => {
          console.log("Starting Firestore transaction for claim...");
          const userDoc = await transaction.get(userDocRef);
          if (!userDoc.exists()) {
              throw new Error("User data not found. Cannot process claim.");
          }

          const data = userDoc.data();
          // Read values needed INSIDE the transaction for consistency
          const hasActiveAnnualSub = data.cmeSubscriptionActive === true;
          const cmeStats = data.cmeStats || { creditsEarned: 0, creditsClaimed: 0 };
          const availableOneTimeCredits = data.cmeCreditsAvailable || 0; // Read one-time credits balance

          console.log(`Transaction Check: hasActiveAnnualSub=${hasActiveAnnualSub}, availableOneTimeCredits=${availableOneTimeCredits}`);

          // Re-validate available credits INSIDE the transaction
          // This check is only relevant if the user DOES NOT have an active subscription
          if (!hasActiveAnnualSub && availableOneTimeCredits < creditsToClaim) {
              throw new Error(`Insufficient credits within transaction. Available: ${availableOneTimeCredits.toFixed(2)}, Trying to claim: ${creditsToClaim}`);
          }

          // Prepare updates object
          const currentClaimedInStats = parseFloat(cmeStats.creditsClaimed || 0);
          const newCreditsClaimedInStats = currentClaimedInStats + creditsToClaim;
          // Update the cmeStats object
          const updatedCmeStats = {
              ...cmeStats, // Keep existing stats like totalAnswered, totalCorrect, creditsEarned
              creditsClaimed: parseFloat(newCreditsClaimedInStats.toFixed(2)) // Update only claimed credits
          };

          // Create the new history entry
          const newHistoryEntry = {
              timestamp: claimTimestamp, // Use the Date object captured earlier
              creditsClaimed: creditsToClaim,
              evaluationData: evaluationData, // Store the collected evaluation data
              // downloadUrl and pdfFileName will be added later if needed after function call
          };
          // Add the new entry to the existing history array (or create one)
          const updatedHistory = [...(data.cmeClaimHistory || []), newHistoryEntry];

          // Initialize the object containing all updates for the transaction.set call
          let updates = {
              cmeStats: updatedCmeStats, // Include the updated stats
              cmeClaimHistory: updatedHistory // Include the updated history
          };

          // --- *** CREDIT DEDUCTION LOGIC *** ---
          if (!hasActiveAnnualSub) {
              // Only deduct if NO active annual sub (meaning they are using one-time credits)
              const newAvailableCredits = availableOneTimeCredits - creditsToClaim;
              // Safety check (though validation above should prevent this)
              if (newAvailableCredits < 0) {
                  throw new Error("Credit balance calculation resulted in negative value. Transaction aborted.");
              }
              // Add the deduction of one-time credits to the 'updates' object
              updates.cmeCreditsAvailable = newAvailableCredits;
              console.log(`DEDUCTING ${creditsToClaim} credits from cmeCreditsAvailable for user ${uid}. New balance will be: ${newAvailableCredits}`);
          } else {
              // Log if deduction is skipped due to active subscription
              console.log(`User ${uid} has active annual sub. Skipping deduction from cmeCreditsAvailable.`);
          }
          // --- *** END CREDIT DEDUCTION LOGIC *** ---

          // Apply all updates gathered in the 'updates' object atomically
          console.log("Applying Firestore updates within transaction:", updates);
          transaction.set(userDocRef, updates, { merge: true }); // Use merge: true to avoid overwriting other user fields
          console.log("Firestore Transaction successful.");
      });
      // --- End of Firestore Transaction ---


      // --- 3. Call the Cloud Function to Generate PDF ---
      if(loadingIndicator) loadingIndicator.querySelector('p').textContent = 'Generating certificate...';
      console.log("Calling Firebase Function 'generateCmeCertificate'...");

      // --- Keep the User Check / Token Refresh Block ---
      if (!auth.currentUser) {
        console.error("CRITICAL: auth.currentUser is NULL immediately before function call!");
        if (errorDiv) { errorDiv.textContent = "Authentication error. Please reload and try again."; }
        cleanup(true, false);
        return;
      } else {
        console.log(`DEBUG: User confirmed before call. UID: ${auth.currentUser.uid}, Email: ${auth.currentUser.email}, Anonymous: ${auth.currentUser.isAnonymous}`);
        try {
            const idTokenResult = await auth.currentUser.getIdTokenResult(true);
            console.log("DEBUG: Forced token refresh successful.");
        } catch (tokenError) {
            console.error("DEBUG: Error forcing token refresh:", tokenError);
        }
      }
      // --- End User Check / Token Refresh Block ---

      const result = await generateCmeCertificateFunction({
          certificateFullName: certificateFullName,
          creditsToClaim: creditsToClaim
      });
      console.log("Cloud Function result received:", result);
      // --- End Cloud Function Call ---


      // --- 4. Handle Cloud Function Response (Update History with Link) ---
      cleanup(false, false); // Hide loader, keep buttons disabled until modal is closed

      console.log("Detailed Check - Success value:", result.data.success, "(Type:", typeof result.data.success + ")");
      console.log("Detailed Check - Public URL value:", result.data.publicUrl, "(Type:", typeof result.data.publicUrl + ")");

      if (result.data.success === true && typeof result.data.publicUrl === 'string' && result.data.publicUrl.length > 0) {
          // ✅ Success!
          const publicUrl = result.data.publicUrl;
          const pdfFileName = result.data.fileName || `CME_Certificate_${certificateFullName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
          console.log("Certificate generated successfully. Public URL:", publicUrl);

          // --- Update History Entry with URL ---
          try {
              console.log("Attempting to update Firestore history with certificate URL...");
              const userDoc = await getDoc(userDocRef); // Get the latest user doc data again
              if (userDoc.exists()) {
                  let history = userDoc.data().cmeClaimHistory || [];
                  // Find the specific history entry using the ISO timestamp string for matching
                  const historyIndex = history.findIndex(entry =>
                      entry.timestamp && typeof entry.timestamp.toDate === 'function' &&
                      entry.timestamp.toDate().toISOString() === claimTimestampISO
                  );

                  if (historyIndex > -1) {
                      // Update the found entry
                      history[historyIndex].downloadUrl = publicUrl;
                      history[historyIndex].pdfFileName = pdfFileName;
                      // Update the document with the modified history array
                      await updateDoc(userDocRef, { cmeClaimHistory: history });
                      console.log(`Successfully updated history entry at index ${historyIndex} with URL.`);
                  } else {
                      console.warn("Could not find the exact history entry to update with URL based on timestamp.", { claimTimestampISO: claimTimestampISO });
                  }
              } else {
                  console.warn("User document doesn't exist while trying to update history with URL.");
              }
          } catch (updateError) {
              console.error("Error updating Firestore history with certificate URL:", updateError);
              // Log error, but don't block user from seeing the link below
          }
          // --- End Update History Entry ---

          // --- Display Download Link ---
          const linkContainer = document.getElementById("claimModalLink");
          if (linkContainer) {
              console.log("Found link container (claimModalLink). Injecting link.");
              linkContainer.innerHTML = `
                  <p style="color: #28a745; font-weight: bold; margin-bottom: 10px;">
                    🎉 Your CME certificate is ready!
                  </p>
                  <a href="${publicUrl}"
                     target="_blank"
                     download="${pdfFileName}"
                     class="auth-primary-btn"
                     style="display: inline-block; padding: 10px 15px; text-decoration: none; margin-top: 5px; background-color: #28a745; border: none;">
                    📄 Download Certificate
                  </a>
                  <p style="font-size: 0.8em; color: #666; margin-top: 10px;">(Link opens in a new tab. You might need to allow pop-ups.)</p>
              `;
              linkContainer.style.display = 'block'; // Make the link section visible

              // Hide the submit/cancel buttons, show only close button
              if (submitButton) submitButton.style.display = 'none';
              if (cancelButton) cancelButton.style.display = 'none';
              const closeButton = document.getElementById('closeCmeClaimModal');
              if(closeButton) {
                   closeButton.style.display = 'block'; // Ensure close button is visible
                   // Re-attach listener just in case (though it should persist)
                   closeButton.onclick = function() { // Use simple assignment
                       document.getElementById('cmeModalOverlay').style.display = 'none';
                       cmeClaimModal.style.display = 'none';
                   };
              }

          } else {
              console.error("CRITICAL: Could not find #claimModalLink element to display download link!");
              if (errorDiv) errorDiv.textContent = "Internal error: Cannot display download link.";
              if (errorDiv && publicUrl) { // Show URL as fallback
                   errorDiv.innerHTML += `<br>URL (Copy): <input type='text' value='${publicUrl}' readonly style='width: 80%;'>`;
              }
              cleanup(true, false); // Re-enable buttons if link injection failed
          }
          // --- End Display Download Link ---

      } else {
          // --- Handle Cloud Function Failure ---
          console.error("Cloud function failed to return success or valid URL. Result data:", result.data);
          let failureReason = "Certificate generation failed in the cloud function.";
          if (!result.data.success) {
              failureReason += ` Error: ${result.data.error || 'Unknown cloud error'}`;
          } else {
              failureReason += " Missing public URL in response.";
          }
          throw new Error(failureReason);
          // --- End Handle Cloud Function Failure ---
      }
      // --- End Handle Cloud Function Response ---


      // --- 5. Refresh Dashboard Data ---
      if (typeof loadCmeDashboardData === 'function') {
          console.log("Scheduling dashboard data refresh...");
          setTimeout(loadCmeDashboardData, 500); // Refresh dashboard after a short delay
      }

  } catch (error) { // Catch errors from Validation, Transaction, or Cloud Function Call
      console.error("Error during claim processing:", error);
      cleanup(true, false); // Re-enable buttons, hide loader on error

      if (errorDiv) {
          let displayMessage = `Claim failed: ${error.message}`;
          // Add more specific error checks if needed
          if (error.message.includes("Insufficient credits")) {
               displayMessage = error.message;
          } else if (error.message.includes("required evaluation questions")) {
               displayMessage = error.message;
          } else if (error.code && error.details) { // Firebase HttpsError
               displayMessage = `Claim failed: ${error.message} (Details: ${error.details})`;
          }

          errorDiv.textContent = displayMessage;
          // Apply error styling
          errorDiv.style.color = '#dc3545';
          errorDiv.style.border = '1px solid #f5c6cb';
          errorDiv.style.backgroundColor = '#f8d7da';
          errorDiv.style.padding = '10px';
          errorDiv.style.borderRadius = '5px';
          errorDiv.style.textAlign = 'left'; // Keep error text aligned left
      } else {
          alert(`Claim failed: ${error.message}`); // Fallback alert
      }
  } finally {
       console.log("--- CME Claim Form Submission Handler END ---");
  }
}
// --- End of handleCmeClaimSubmission Function ---


// --- Step 5b: Populate CME Category Dropdown ---

async function populateCmeCategoryDropdown() {
    const categorySelect = document.getElementById("cmeCategorySelect");
    if (!categorySelect) {
        console.error("CME Category Select dropdown (#cmeCategorySelect) not found.");
        return;
    }

    // Clear existing options except the first "All" option
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }

    try {
        // Fetch all questions to extract categories
        // Note: This fetches all questions just for categories.
        // If performance becomes an issue with a very large sheet,
        // consider storing categories separately in Firestore.
        const allQuestions = await fetchQuestionBank(); // Assuming fetchQuestionBank is globally available or defined in this file

        // Filter for CME eligible questions first
        const cmeEligibleQuestions = allQuestions.filter(q => q["CME Eligible"] && q["CME Eligible"].trim().toLowerCase() === 'yes');

        // Get unique categories from CME-eligible questions
        const categories = [...new Set(cmeEligibleQuestions
            .map(q => q.Category ? q.Category.trim() : null) // Get category, trim whitespace
            .filter(cat => cat && cat !== "") // Filter out null/empty categories
        )].sort(); // Sort alphabetically

        // Add categories to the dropdown
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
        console.log("CME Category dropdown populated with:", categories);

    } catch (error) {
        console.error("Error fetching or processing questions for categories:", error);
        // Optionally inform the user
        // alert("Could not load categories. Please try again later.");
    }
}

// --- End of Step 5b Code ---

// --- Step 9: Load and Display CME Dashboard Data ---

// --- Step 9: Load and Display CME Dashboard Data (MODIFIED for Unique Counts & Remaining) ---

async function loadCmeDashboardData() {
  console.log("Loading CME dashboard data...");
  const trackerContent = document.getElementById("cmeTrackerContent");
  const historyContent = document.getElementById("cmeHistoryContent");
  const claimButton = document.getElementById("claimCmeBtn");

  // Ensure elements exist
  if (!trackerContent || !historyContent || !claimButton) {
      console.error("Required CME dashboard elements not found.");
      return;
  }

  // Reset display while loading
  trackerContent.innerHTML = "<p>Loading tracker data...</p>";
  historyContent.innerHTML = "<p>Loading history...</p>";
  claimButton.disabled = true; // Disable button while loading/if no credits

  // Ensure user is logged in and registered
  if (!window.authState || !window.authState.user || window.authState.user.isAnonymous) {
      trackerContent.innerHTML = "<p>Please log in as a registered user to view CME data.</p>";
      historyContent.innerHTML = "<p>Login required.</p>";
      console.log("User not logged in/registered for CME data.");
      return;
  }

  const uid = window.authState.user.uid;
  const userDocRef = doc(db, 'users', uid);

  try {
      // --- Fetch User Data and Question Bank Concurrently (Slightly Faster) ---
      const [userDocSnap, allQuestions] = await Promise.all([
          getDoc(userDocRef),
          fetchQuestionBank() // Fetch the full question bank
      ]);
      // --- End Concurrent Fetch ---

      if (!userDocSnap.exists()) {
          trackerContent.innerHTML = "<p>No CME data found for this user.</p>";
          historyContent.innerHTML = "<p>No claim history.</p>";
          console.log("User document not found for CME data.");
          return;
      }

      // --- Process User Data ---
      const data = userDocSnap.data();
      const cmeStats = data.cmeStats || { // Default to zeros if cmeStats doesn't exist
          totalAnswered: 0,       // Now unique answered
          totalCorrect: 0,        // Now unique correct
          eligibleAnswerCount: 0,
          creditsEarned: 0.00,
          creditsClaimed: 0.00
      };
      const cmeHistory = data.cmeClaimHistory || []; // Default to empty array
      const cmeAnsweredQuestionsMap = data.cmeAnsweredQuestions || {}; // Get the map of answered questions
      const uniqueCmeAnsweredCount = Object.keys(cmeAnsweredQuestionsMap).length; // Count unique answered

      // --- Process Question Bank Data ---
      const cmeEligibleQuestions = allQuestions.filter(q =>
          q["CME Eligible"] && q["CME Eligible"].trim().toLowerCase() === 'yes'
      );
      const totalCmeEligibleInBank = cmeEligibleQuestions.length;

      // --- Calculate Remaining Questions ---
      const remainingCmeQuestions = Math.max(0, totalCmeEligibleInBank - uniqueCmeAnsweredCount);

      // --- Update Tracker Card ---
      // Accuracy is now based on unique counts
      const uniqueCmeAccuracy = cmeStats.totalAnswered > 0
          ? Math.round((cmeStats.totalCorrect / cmeStats.totalAnswered) * 100)
          : 0;
      // Ensure credits are formatted to 2 decimal places
      const creditsEarned = parseFloat(cmeStats.creditsEarned || 0).toFixed(2);
      const creditsClaimed = parseFloat(cmeStats.creditsClaimed || 0).toFixed(2);
      const creditsAvailable = Math.max(0, creditsEarned - creditsClaimed).toFixed(2); // Ensure not negative

      // Update the HTML structure to include "Remaining"
      trackerContent.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
              <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: #0C72D3;">${cmeStats.totalAnswered}</div>
                  <div style="font-size: 0.8em; color: #555;">Questions Answered</div>
              </div>
              <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: #0C72D3;">${cmeStats.totalCorrect}</div>
                  <div style="font-size: 0.8em; color: #555;">Correct Answers</div>
              </div>
               <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: ${uniqueCmeAccuracy >= 70 ? '#28a745' : '#dc3545'};">${uniqueCmeAccuracy}%</div>
                  <div style="font-size: 0.8em; color: #555;">Accuracy</div>
              </div>
               <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: #0C72D3;">${remainingCmeQuestions}</div>
                  <div style="font-size: 0.8em; color: #555;">Remaining Questions</div>
              </div>
               <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: #0C72D3;">${creditsEarned}</div>
                  <div style="font-size: 0.8em; color: #555;">Total Credits Earned</div>
              </div>
               <div style="text-align: center;">
                  <div style="font-size: 1.4em; font-weight: bold; color: #0C72D3;">${creditsAvailable}</div>
                  <div style="font-size: 0.8em; color: #555;">Available to Claim</div>
              </div>
          </div>
          ${uniqueCmeAccuracy < 70 && cmeStats.totalAnswered > 0 ? '<p style="color: #dc3545; font-size: 0.85rem; text-align: center; margin-top: 10px;">Note: Unique Accuracy must be >= 70% to earn credits.</p>' : ''}
      `;

      // Enable/disable claim button (logic remains the same)
      if (parseFloat(creditsAvailable) >= 0.25) {
          claimButton.disabled = false;
          claimButton.textContent = `Claim ${creditsAvailable} Credits`;
      } else {
          claimButton.disabled = true;
          claimButton.textContent = "Claim CME Credits"; // Reset text
      }

      // --- Update History Card (No changes needed here) ---
      if (cmeHistory.length > 0) {
        cmeHistory.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0)); // Sort newest first
        let historyHtml = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd; text-align: left;">
                        <th style="padding: 8px 5px;">Date Claimed</th>
                        <th style="padding: 8px 5px; text-align: right;">Credits</th>
                        <th style="padding: 8px 5px; text-align: center;">Certificate</th>
                    </tr>
                </thead>
                <tbody>
        `;
        cmeHistory.forEach(claim => {
            const credits = parseFloat(claim.creditsClaimed || 0).toFixed(2);
            let claimDate = 'Unknown Date';
            if (claim.timestamp && typeof claim.timestamp.toDate === 'function') {
                claimDate = claim.timestamp.toDate().toLocaleDateString();
            } else if (claim.timestamp instanceof Date) {
                claimDate = claim.timestamp.toLocaleDateString();
            }
            let downloadCellContent = '-';
            if (claim.downloadUrl) {
                downloadCellContent = `
                    <a href="${claim.downloadUrl}" target="_blank" download="${claim.pdfFileName || 'CME_Certificate.pdf'}" class="cme-download-btn" title="Download PDF">
                        ⬇️ PDF
                    </a>
                `;
            }
            historyHtml += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px 5px;">${claimDate}</td>
                    <td style="padding: 8px 5px; text-align: right;">${credits}</td>
                    <td style="padding: 8px 5px; text-align: center;">${downloadCellContent}</td>
                </tr>
            `;
        });
        historyHtml += `
                </tbody>
            </table>
            <style>
              .cme-download-btn { display: inline-block; padding: 3px 8px; font-size: 0.8em; color: white; background-color: #007bff; border: none; border-radius: 4px; text-decoration: none; cursor: pointer; transition: background-color 0.2s; }
              .cme-download-btn:hover { background-color: #0056b3; }
            </style>
        `;
        historyContent.innerHTML = historyHtml;
    } else {
        historyContent.innerHTML = "<p style='text-align: center; color: #666;'>No credits claimed yet.</p>";
    }
    // --- End of History Card Update ---

    console.log("CME dashboard data loaded and displayed with unique counts and remaining.");

} catch (error) {
    console.error("Error loading CME dashboard data:", error);
    trackerContent.innerHTML = "<p style='color: red;'>Error loading tracker data.</p>";
    historyContent.innerHTML = "<p style='color: red;'>Error loading history.</p>";
}
}

// --- Function to Show the CME Info/Paywall Screen ---
function showCmeInfoScreen() {
  console.log("Executing showCmeInfoScreen...");

  // Define IDs of views/modals/elements to hide
  const elementsToHideIds = [
      "mainOptions", "cmeDashboardView", "performanceView", "leaderboardView",
      "aboutView", "faqView", "welcomeScreen", "splashScreen", "loginScreen",
      "onboardingLoadingScreen", "customQuizForm", "randomQuizForm",
      "quizSetupModal", "cmeQuizSetupModal", "cmeClaimModal", "contactModal",
      "feedbackModal", "loginModal", "registerModal", "forgotPasswordModal",
      "registrationBenefitsModal", "termsOfServiceModal", "privacyPolicyModal"
  ];
  const elementsToHideSelectors = [".swiper", "#bottomToolbar", "#iconBar"];

  // Hide elements by ID
  elementsToHideIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
          element.style.display = "none";
          console.log(`Hid element: #${id}`);
      }
  });

  // Hide elements by selector
  elementsToHideSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
          element.style.display = "none";
          console.log(`Hid element: ${selector}`);
      }
  });

  // Show the CME Info Screen
  const cmeInfoScreen = document.getElementById("cmeInfoScreen");
  if (cmeInfoScreen) {
      cmeInfoScreen.style.display = "flex"; // Use 'flex' because of the CSS styling we added
      console.log("Displayed #cmeInfoScreen.");
  } else {
      console.error("CME Info Screen (#cmeInfoScreen) not found!");
  }
}

// --- Event Listeners for CME Info Screen Buttons ---

// Back Button
const cmeInfoBackBtn = document.getElementById("cmeInfoBackBtn");
if (cmeInfoBackBtn) {
  cmeInfoBackBtn.addEventListener("click", function() {
      console.log("CME Info Back button clicked.");
      const cmeInfoScreen = document.getElementById("cmeInfoScreen");
      const mainOptions = document.getElementById("mainOptions");

      if (cmeInfoScreen) cmeInfoScreen.style.display = "none";
      if (mainOptions) mainOptions.style.display = "flex"; // Show main dashboard
  });
} else {
  console.error("CME Info Back button (#cmeInfoBackBtn) not found.");
}

// Unlock CME Button (Placeholder for Stripe)
const unlockCmeBtn = document.getElementById("unlockCmeBtn");
if (unlockCmeBtn) {
  unlockCmeBtn.addEventListener("click", function() {
      console.log("Unlock CME button clicked.");
      showCmePricingScreen(); // <<<--- Call function to show pricing screen
  });
} else {
  console.error("Unlock CME button (#unlockCmeBtn) not found.");
}

// Learn More Link (Placeholder)
const learnMoreCmeLink = document.getElementById("learnMoreCmeLink");
if (learnMoreCmeLink) {
  learnMoreCmeLink.addEventListener("click", function(e) {
      e.preventDefault(); // Prevent default link behavior
      console.log("Learn More link clicked.");
      showCmeLearnMoreModal();
  });
} else {
  console.error("Learn More link (#learnMoreCmeLink) not found.");
}

// --- Function to Show the CME Pricing Screen ---
function showCmePricingScreen() {
  console.log("Executing showCmePricingScreen...");

  // Hide the Info Screen first
  const cmeInfoScreen = document.getElementById("cmeInfoScreen");
  if (cmeInfoScreen) {
      cmeInfoScreen.style.display = "none";
  }

  // Show the Pricing Screen
  const cmePricingScreen = document.getElementById("cmePricingScreen");
  if (cmePricingScreen) {
      cmePricingScreen.style.display = "flex"; // Use 'flex' based on CSS
      // Default to Annual view when showing
      updatePricingView('annual');
      console.log("Displayed #cmePricingScreen.");
  } else {
      console.error("CME Pricing Screen (#cmePricingScreen) not found!");
  }
}

// --- Helper function to update pricing view ---
function updatePricingView(planType) {
  const priceDisplay = document.getElementById('cmePriceDisplay');
  const annualBtn = document.getElementById('cmeAnnualBtn');
  const monthlyBtn = document.getElementById('cmeMonthlyBtn');
  const annualFeatureList = document.getElementById('cmeFeatureList'); // Get annual list
  const monthlyFeatureList = document.getElementById('cmeMonthlyFeatureList'); // Get monthly list

  // Exit if any essential element is missing
  if (!priceDisplay || !annualBtn || !monthlyBtn || !annualFeatureList || !monthlyFeatureList) {
       console.error("One or more pricing view elements are missing.");
       return;
  }


  if (planType === 'annual') {
      priceDisplay.textContent = '$149/year';
      annualBtn.classList.add('active');
      monthlyBtn.classList.remove('active');
      annualFeatureList.style.display = 'inline-block'; // Show annual features
      monthlyFeatureList.style.display = 'none'; // Hide monthly features
      console.log("Switched to Annual pricing view.");
  } else if (planType === 'monthly') {
      priceDisplay.textContent = '$14.99/month';
      monthlyBtn.classList.add('active');
      annualBtn.classList.remove('active');
      annualFeatureList.style.display = 'none'; // Hide annual features
      monthlyFeatureList.style.display = 'inline-block'; // Show monthly features
      console.log("Switched to Monthly pricing view.");
  }
}


// --- Event Listeners for CME Pricing Screen Buttons ---

// Back Button (Pricing Screen to Info Screen)
const cmePricingBackBtn = document.getElementById("cmePricingBackBtn");
if (cmePricingBackBtn) {
  cmePricingBackBtn.addEventListener("click", function() {
      console.log("CME Pricing Back button clicked.");
      const cmePricingScreen = document.getElementById("cmePricingScreen");
      const cmeInfoScreen = document.getElementById("cmeInfoScreen");

      if (cmePricingScreen) cmePricingScreen.style.display = "none";
      if (cmeInfoScreen) cmeInfoScreen.style.display = "flex"; // Show info screen again
  });
} else {
  console.error("CME Pricing Back button (#cmePricingBackBtn) not found.");
}

// Annual Toggle Button
const cmeAnnualBtn = document.getElementById("cmeAnnualBtn");
if (cmeAnnualBtn) {
  cmeAnnualBtn.addEventListener("click", function() {
      updatePricingView('annual');
  });
} else {
  console.error("CME Annual button (#cmeAnnualBtn) not found.");
}

// --- Logic for Pricing Screen Tab Switching ---

const annualTabBtn = document.getElementById('cmeAnnualBtn');
const payPerCreditTabBtn = document.getElementById('cmePayPerCreditBtn');
const annualContent = document.getElementById('cmeAnnualContent');
const payPerCreditContent = document.getElementById('cmePayPerCreditContent');

// Listener for Annual Tab
if (annualTabBtn && annualContent && payPerCreditContent) {
    annualTabBtn.addEventListener('click', () => {
        console.log("Annual tab clicked");
        // Update button states
        annualTabBtn.classList.add('active');
        if (payPerCreditTabBtn) payPerCreditTabBtn.classList.remove('active');

        // Update content visibility
        annualContent.style.display = 'block'; // Or 'flex' if you prefer
        payPerCreditContent.style.display = 'none';
    });
} else {
     console.error("Missing elements for Annual tab functionality.");
}

// Listener for Pay-Per-Credit Tab
if (payPerCreditTabBtn && annualContent && payPerCreditContent) {
    payPerCreditTabBtn.addEventListener('click', () => {
        console.log("Pay-Per-Credit tab clicked");
        // Update button states
        payPerCreditTabBtn.classList.add('active');
        if (annualTabBtn) annualTabBtn.classList.remove('active');

        // Update content visibility
        payPerCreditContent.style.display = 'block'; // Or 'flex'
        annualContent.style.display = 'none';
    });
} else {
     console.error("Missing elements for Pay-Per-Credit tab functionality.");
}
// --- End Pricing Screen Tab Switching ---


// --- Add your Stripe Price IDs (Test Mode) ---
const STRIPE_ANNUAL_PRICE_ID = 'price_1RFkDtR9wwfN8hwye6csyxWu'; // Replace with your actual Annual Price ID (price_...)
// New unit-price for credits:
const STRIPE_CREDIT_PRICE_ID = 'price_1RKXlYR9wwfN8hwyGznI4iXS'; // ← paste your new Price ID

// ---

    // Checkout Button
    // --- Listener for ANNUAL Subscription Button ---
const cmeCheckoutAnnualBtn = document.getElementById("cmeCheckoutAnnualBtn"); // <<< Use the NEW ID we set in HTML
if (cmeCheckoutAnnualBtn) {
    cmeCheckoutAnnualBtn.addEventListener("click", async function() {
        // --- Keep the Price ID simple ---
        const selectedPriceId = STRIPE_ANNUAL_PRICE_ID; // <<< ALWAYS use the Annual ID here
        const planName = 'Annual'; // <<< Set plan name directly

        console.log(`Requesting checkout session for ${planName} plan with Price ID: ${selectedPriceId}`);

        // --- Keep your existing Auth checks ---
        const user = window.authFunctions.getCurrentUser();
        if (!user || user.isAnonymous) {
            alert("Please register or log in fully before purchasing a subscription.");
            console.warn("Checkout attempted by anonymous user.");
            return;
        }
        if (!window.stripe || !createCheckoutSessionFunction) {
            alert('Error: Payment system or function reference not ready. Please refresh.');
            console.error('Stripe object or callable function reference missing.');
            return;
        }
        // --- End Auth checks ---

        // Disable button
        cmeCheckoutAnnualBtn.disabled = true;
        cmeCheckoutAnnualBtn.textContent = 'Preparing Checkout...';

        try {
            // --- FORCE TOKEN REFRESH (Keep this) ---
            console.log("Forcing ID token refresh...");
            await getIdToken(user, true); // Pass true to force refresh
            console.log("ID token refreshed.");
            // --- END TOKEN REFRESH ---

            // Call the Cloud Function - Pass only the Annual Price ID
            console.log("Calling createStripeCheckoutSession function for user:", user.uid);
            const result = await createCheckoutSessionFunction({ priceId: selectedPriceId }); // <<< Pass ONLY priceId
            const sessionId = result.data.sessionId;
            console.log("Received Session ID:", sessionId);

            if (!sessionId) { throw new Error("Cloud function did not return a Session ID."); }

            // Redirect using the Session ID (Keep this)
            cmeCheckoutAnnualBtn.textContent = 'Redirecting...';
            const { error } = await window.stripe.redirectToCheckout({ sessionId: sessionId });

            // Handle redirect error (Keep this)
            if (error) {
                console.error("Stripe redirectToCheckout error:", error);
                alert(`Could not redirect to checkout: ${error.message}`);
                cmeCheckoutAnnualBtn.disabled = false;
                cmeCheckoutAnnualBtn.textContent = 'Subscribe Annually'; // Reset text
            }

        } catch (error) {
            // Handle function call error (Keep this)
            console.error("Error during Annual checkout:", error);
            let message = "Could not prepare Annual checkout. Please try again.";
             if (error.code && error.message) { message = `Error: ${error.message}`; }
             else if (error.message) { message = error.message; }
            alert(message);
            cmeCheckoutAnnualBtn.disabled = false;
            cmeCheckoutAnnualBtn.textContent = 'Subscribe Annually'; // Reset text
        }
    });
} else {
    console.error("CME Annual Checkout button (#cmeCheckoutAnnualBtn) not found.");
}

// --- Listener for BUY CREDITS Button ---
const cmeBuyCreditsBtn = document.getElementById("cmeBuyCreditsBtn");
if (cmeBuyCreditsBtn) {
    cmeBuyCreditsBtn.addEventListener("click", async function() {
        // Get the quantity chosen by the user
        const quantityInput = document.getElementById('creditQty');
        let quantity = 1; // Default quantity
        if (quantityInput) {
            // Use Number() for conversion, handle potential errors
            const parsedValue = Number(quantityInput.value);
            if (!isNaN(parsedValue)) {
                 quantity = parsedValue;
            }
        }

        // Validate quantity
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 25) {
            alert("Please enter a whole number of credits between 1 and 25.");
            // Optionally reset the input value
            if(quantityInput) quantityInput.value = '1';
            return; // Stop if invalid
        }

        const selectedPriceId = STRIPE_CREDIT_PRICE_ID; // <<< Use the NEW Credit Price ID

        console.log(`Requesting checkout session for ${quantity} credits with Price ID: ${selectedPriceId}`);

        // --- Keep your existing Auth checks ---
        const user = window.authFunctions.getCurrentUser();
         if (!user || user.isAnonymous) {
             alert("Please register or log in fully before purchasing credits.");
             console.warn("Credit purchase attempted by anonymous user.");
             return;
         }
        if (!window.stripe || !createCheckoutSessionFunction) {
            alert('Error: Payment system or function reference not ready. Please refresh.');
            console.error('Stripe object or callable function reference missing.');
            return;
        }
        // --- End Auth checks ---

        // Disable button
        cmeBuyCreditsBtn.disabled = true;
        cmeBuyCreditsBtn.textContent = 'Preparing Purchase...';

        try {
            // --- FORCE TOKEN REFRESH (Keep this) ---
            console.log("Forcing ID token refresh...");
            await getIdToken(user, true);
            console.log("ID token refreshed.");
            // --- END TOKEN REFRESH ---

            // Call the Cloud Function - Pass the CREDIT Price ID AND the quantity
            console.log("Calling createStripeCheckoutSession function for user:", user.uid);
            const result = await createCheckoutSessionFunction({
                priceId: selectedPriceId, // <<< Pass the Credit Price ID
                quantity: quantity       // <<< Pass the quantity
            });
            const sessionId = result.data.sessionId;
            console.log("Received Session ID:", sessionId);

            if (!sessionId) { throw new Error("Cloud function did not return a Session ID."); }

            // Redirect using the Session ID (Keep this)
            cmeBuyCreditsBtn.textContent = 'Redirecting...';
            const { error } = await window.stripe.redirectToCheckout({ sessionId: sessionId });

            // Handle redirect error (Keep this)
            if (error) {
                console.error("Stripe redirectToCheckout error:", error);
                alert(`Could not redirect to checkout: ${error.message}`);
                cmeBuyCreditsBtn.disabled = false;
                cmeBuyCreditsBtn.textContent = 'Buy Credits'; // Reset text
            }

        } catch (error) {
            // Handle function call error (Keep this)
            console.error("Error during Buy Credits checkout:", error);
            let message = "Could not prepare purchase. Please try again.";
             if (error.code && error.message) { message = `Error: ${error.message}`; }
             else if (error.message) { message = error.message; }
            alert(message);
            cmeBuyCreditsBtn.disabled = false;
            cmeBuyCreditsBtn.textContent = 'Buy Credits'; // Reset text
        }
    });
} else {
    console.error("CME Buy Credits button (#cmeBuyCreditsBtn) not found.");
}

// --- Function to Show the CME Learn More Modal ---
function showCmeLearnMoreModal() {
  console.log("Executing showCmeLearnMoreModal...");

  // Hide the Info Screen first (where the link was clicked)
  const cmeInfoScreen = document.getElementById("cmeInfoScreen");
  if (cmeInfoScreen) {
      cmeInfoScreen.style.display = "none";
  }

  // Show the Learn More Modal
  const cmeLearnMoreModal = document.getElementById("cmeLearnMoreModal");
  if (cmeLearnMoreModal) {
      cmeLearnMoreModal.style.display = "flex"; // Use 'flex' based on base modal CSS
      // Scroll modal body to top when opened
      const modalBody = cmeLearnMoreModal.querySelector('.modal-body');
      if(modalBody) modalBody.scrollTop = 0;
      console.log("Displayed #cmeLearnMoreModal.");
  } else {
      console.error("CME Learn More Modal (#cmeLearnMoreModal) not found!");
  }
}

// --- Event Listeners for CME Learn More Modal Buttons ---

// Close Button (X)
const closeCmeLearnMoreModal = document.getElementById("closeCmeLearnMoreModal");
if (closeCmeLearnMoreModal) {
  closeCmeLearnMoreModal.addEventListener("click", function() {
      console.log("CME Learn More Close button clicked.");
      const cmeLearnMoreModal = document.getElementById("cmeLearnMoreModal");
      const cmeInfoScreen = document.getElementById("cmeInfoScreen");

      if (cmeLearnMoreModal) cmeLearnMoreModal.style.display = "none";
      if (cmeInfoScreen) cmeInfoScreen.style.display = "flex"; // Show info screen again
  });
} else {
  console.error("CME Learn More Close button (#closeCmeLearnMoreModal) not found.");
}

// Continue to Checkout Button
const continueToCheckoutBtn = document.getElementById("continueToCheckoutBtn");
if (continueToCheckoutBtn) {
  continueToCheckoutBtn.addEventListener("click", function() {
      console.log("Continue to Checkout button clicked from Learn More modal.");
      const cmeLearnMoreModal = document.getElementById("cmeLearnMoreModal");

      if (cmeLearnMoreModal) cmeLearnMoreModal.style.display = "none";
      showCmePricingScreen(); // Show the pricing screen
  });
} else {
  console.error("Continue to Checkout button (#continueToCheckoutBtn) not found.");
}

// Return to Main Dashboard Button
const returnToDashboardBtn = document.getElementById("returnToDashboardBtn");
if (returnToDashboardBtn) {
  returnToDashboardBtn.addEventListener("click", function() {
      console.log("Return to Dashboard button clicked from Learn More modal.");
      const cmeLearnMoreModal = document.getElementById("cmeLearnMoreModal");
      const cmeInfoScreen = document.getElementById("cmeInfoScreen"); // Also hide info screen if needed
      const mainOptions = document.getElementById("mainOptions");

      if (cmeLearnMoreModal) cmeLearnMoreModal.style.display = "none";
      if (cmeInfoScreen) cmeInfoScreen.style.display = "none"; // Ensure info screen is hidden too
      if (mainOptions) mainOptions.style.display = "flex"; // Show main dashboard
  });
} else {
  console.error("Return to Dashboard button (#returnToDashboardBtn) not found.");
}

// Optional: Close modal if clicking outside the content
const cmeLearnMoreModal = document.getElementById("cmeLearnMoreModal");
if (cmeLearnMoreModal) {
   cmeLearnMoreModal.addEventListener('click', function(event) {
       // Check if the click is directly on the modal background
       if (event.target === cmeLearnMoreModal) {
           console.log("Clicked outside Learn More modal content.");
           const cmeInfoScreen = document.getElementById("cmeInfoScreen");
           cmeLearnMoreModal.style.display = 'none';
           if (cmeInfoScreen) cmeInfoScreen.style.display = "flex"; // Show info screen again
       }
   });
}