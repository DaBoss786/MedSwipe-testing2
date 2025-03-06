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
      displayPerformance();
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
