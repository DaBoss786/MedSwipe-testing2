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
// Function to load leaderboard preview data with weekly XP rankings
async function loadLeaderboardPreview() {
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for leaderboard preview");
    return;
  }
  
  const leaderboardPreview = document.getElementById("leaderboardPreview");
  if (!leaderboardPreview) return;
  
  try {
    const currentUid = window.auth.currentUser.uid;
    const querySnapshot = await window.getDocs(window.collection(window.db, 'users'));
    let leaderboardEntries = [];
    
    // Get the start of the current week for filtering
    const weekStart = getStartOfWeek();
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.stats) {
        // Calculate weekly XP instead of using total XP
        let weeklyXP = 0;
        
        // Calculate XP from questions answered this week
        if (data.answeredQuestions) {
          for (const questionId in data.answeredQuestions) {
            const answer = data.answeredQuestions[questionId];
            if (answer.timestamp && answer.timestamp >= weekStart) {
              // Basic XP calculation: 1 for answering, 2 more if correct
              weeklyXP += 1 + (answer.isCorrect ? 2 : 0);
            }
          }
        }
        
        // Add user to leaderboard entries with their weekly XP
        leaderboardEntries.push({
          uid: docSnap.id,
          username: data.username || "Anonymous",
          xp: weeklyXP
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
    
    // Add a small "Weekly" indicator to show these are weekly rankings
    html += '<div class="leaderboard-preview-header">Weekly Rankings</div>';
    
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
    }
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// Set up event listeners for dashboard
function setupDashboardEvents() {
  // Start Quiz button
  const startQuizBtn = document.getElementById("startQuizBtn");
  if (startQuizBtn) {
    startQuizBtn.addEventListener("click", function() {
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
      
      loadQuestions({
        type: category ? 'custom' : 'random',
        category: category,
        num: numQuestions,
        includeAnswered: includeAnswered
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
      displayPerformance();
    });
  }
  
  // Quick Stats card click - go to Performance
  const quickStatsCard = document.getElementById("quickStatsCard");
  if (quickStatsCard) {
    quickStatsCard.addEventListener("click", function() {
      displayPerformance();
    });
  }
  
  // Leaderboard Preview card click - go to Leaderboard
  const leaderboardPreviewCard = document.getElementById("leaderboardPreviewCard");
  if (leaderboardPreviewCard) {
    leaderboardPreviewCard.addEventListener("click", function() {
      showLeaderboard();
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
