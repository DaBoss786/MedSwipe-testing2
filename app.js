// Add splash screen, welcome screen, and authentication-based routing
document.addEventListener('DOMContentLoaded', function() {
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
    if (window.auth && window.auth.currentUser) {
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
      window.displayPerformance(); 
    });
  }
  
  // Bookmarks from user menu - start a bookmarks-only quiz
  const bookmarksFilterUser = document.getElementById("bookmarksFilterUser");
  if (bookmarksFilterUser) {
    bookmarksFilterUser.addEventListener("click", function(e) {
      e.preventDefault();
      closeUserMenu();
      
      // Start a quiz with only bookmarked questions
      loadQuestions({
        bookmarksOnly: true,
        num: 50 // Large number to include all bookmarks
      });
    });
  }
  
  // Reset progress from user menu
  const resetProgressUser = document.getElementById("resetProgressUser");
  if (resetProgressUser) {
    resetProgressUser.addEventListener("click", async function(e) {
      e.preventDefault();
      const confirmReset = confirm("Are you sure you want to reset all progress?");
      if (!confirmReset) return;
      
      if (!window.auth || !window.auth.currentUser) {
        alert("User not authenticated. Please try again later.");
        return;
      }
      
      const uid = window.auth.currentUser.uid;
      const userDocRef = window.doc(window.db, 'users', uid);
      try {
        await window.runTransaction(window.db, async (transaction) => {
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
      
      const mainOptions = document.getElementById("mainOptions");
      if (mainOptions) mainOptions.style.display = "flex";
    });
  }
  
  // LEADERBOARD
  const leaderboardItem = document.getElementById("leaderboardItem");
  if (leaderboardItem) {
    leaderboardItem.addEventListener("click", function() {
      closeSideMenu();
      showLeaderboard();
    });
  }
  
  // FAQ
  const faqItem = document.getElementById("faqItem");
  if (faqItem) {
    faqItem.addEventListener("click", function() {
      closeSideMenu();
      showFAQ();
    });
  }
  
  // ABOUT US
  const aboutItem = document.getElementById("aboutItem");
  if (aboutItem) {
    aboutItem.addEventListener("click", function() {
      closeSideMenu();
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
        await window.addDoc(window.collection(window.db, "feedback"), {
          questionId: currentFeedbackQuestionId,
          questionText: currentFeedbackQuestionText,
          feedback: feedbackText.value.trim(),
          timestamp: window.serverTimestamp()
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
        if (!window.auth || !window.auth.currentUser) {
          alert("User not authenticated. Please try again later.");
          return;
        }
        
        await window.addDoc(window.collection(window.db, "contact"), {
          email: email,
          message: message,
          timestamp: window.serverTimestamp(),
          userId: window.auth.currentUser.uid
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
    if (window.auth && window.auth.currentUser) {
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
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated yet");
    return;
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    
    await window.runTransaction(window.db, async (transaction) => {
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
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for leaderboard preview");
    return;
  }
  
  const leaderboardPreview = document.getElementById("leaderboardPreview");
  if (!leaderboardPreview) return;
  
  // Check if user is anonymous (guest)
  const isAnonymous = window.auth.currentUser.isAnonymous;
  
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
    const currentUid = window.auth.currentUser.uid;
    const querySnapshot = await window.getDocs(window.collection(window.db, 'users'));
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
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for dashboard");
    setTimeout(initializeDashboard, 1000);
    return;
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    
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
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// Function to count questions due for review today
async function countDueReviews() {
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for counting reviews");
    return { dueCount: 0, nextReviewDate: null };
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    
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
  const isAnonymous = window.auth && window.auth.currentUser && window.auth.currentUser.isAnonymous;
  
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
    const isAnonymous = window.auth && window.auth.currentUser && window.auth.currentUser.isAnonymous;
    
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
  
  // Leaderboard Preview card click - go to Leaderboard
  const leaderboardPreviewCard = document.getElementById("leaderboardPreviewCard");
  if (leaderboardPreviewCard) {
    leaderboardPreviewCard.addEventListener("click", function() {
      showLeaderboard();
    });
  }
  
  // Review Queue card click
const reviewQueueCard = document.getElementById("reviewQueueCard");
if (reviewQueueCard) {
  reviewQueueCard.addEventListener("click", async function() {
    // Check if user is anonymous/guest
    const isAnonymous = window.auth && window.auth.currentUser && window.auth.currentUser.isAnonymous;
    
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
    if (window.auth && window.auth.currentUser) {
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
  if (!window.auth || !window.auth.currentUser || !window.db) {
    return [];
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    
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

// Function to load only specific questions by ID
async function loadSpecificQuestions(questionIds) {
  if (!questionIds || questionIds.length === 0) {
    alert("No questions to review.");
    return;
  }
  
  console.log("Loading specific review questions:", questionIds.length);
  
  // Fetch all questions from CSV
  Papa.parse(csvUrl, {
    download: true,
    header: true,
    complete: function(results) {
      console.log("All questions loaded:", results.data.length);
      
      // Filter only the questions that are due for review
      const reviewQuestions = results.data.filter(q => 
        questionIds.includes(q["Question"].trim())
      );
      
      console.log("Filtered review questions:", reviewQuestions.length);
      
      if (reviewQuestions.length === 0) {
        alert("No review questions found. This might be because questions have been removed from the question bank.");
        return;
      }
      
      // Shuffle the review questions for a better learning experience
      const shuffledReviewQuestions = shuffleArray([...reviewQuestions]);
      
      // Initialize the quiz with only these specific review questions
      initializeQuiz(shuffledReviewQuestions);
    },
    error: function(error) {
      console.error("Error parsing CSV:", error);
      alert("Error loading questions. Please try again later.");
    }
  });
}
// Add this helper function at the end of app.js
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
  const isAnonymous = window.auth.currentUser && window.auth.currentUser.isAnonymous;
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
    await window.sendPasswordResetEmail(window.auth, email);
    
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
  if (!window.auth || !window.auth.currentUser || !window.auth.currentUser.isAnonymous) {
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
