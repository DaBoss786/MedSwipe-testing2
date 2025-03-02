// Main app initialization
window.addEventListener('load', function() {
  // Initialize user menu with username
  updateUserMenu();
  
  // Score circle click => open user menu
  document.getElementById("scoreCircle").addEventListener("click", function() {
    document.getElementById("userMenu").classList.add("open");
    document.getElementById("menuOverlay").classList.add("show");
  });
  
  // User menu close button
  document.getElementById("userMenuClose").addEventListener("click", function() {
    closeUserMenu();
  });
  
  // Performance from user menu
  document.getElementById("performanceItemUser").addEventListener("click", function() {
    closeUserMenu();
    displayPerformance();
  });
  
  // Bookmarks from user menu
  document.getElementById("bookmarksFilterUser").addEventListener("click", function(e) {
    e.preventDefault();
    closeUserMenu();
    // Bookmark functionality here
  });
  
  // Reset progress from user menu
  document.getElementById("resetProgressUser").addEventListener("click", async function(e) {
    e.preventDefault();
    const confirmReset = confirm("Are you sure you want to reset all progress?");
    if (!confirmReset) return;
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
      updateUserCompositeScore();
      updateUserMenu();
    } catch (error) {
      console.error("Error resetting progress:", error);
      alert("There was an error resetting your progress.");
    }
    closeUserMenu();
  });
  
  // CUSTOM QUIZ BUTTON => show modal
  document.getElementById("customQuizBtn").addEventListener("click", function() {
    window.filterMode = "all";
    closeSideMenu();
    document.getElementById("aboutView").style.display = "none";
    document.getElementById("faqView").style.display = "none";
    document.getElementById("customQuizForm").style.display = "block";
  });
  
  // RANDOM QUIZ BUTTON => show modal
  document.getElementById("randomQuizBtn").addEventListener("click", function() {
    window.filterMode = "all";
    closeSideMenu();
    document.getElementById("aboutView").style.display = "none";
    document.getElementById("faqView").style.display = "none";
    document.getElementById("randomQuizForm").style.display = "block";
  });
  
  // START QUIZ (Custom) => hide modal, load quiz
  document.getElementById("startCustomQuiz").addEventListener("click", function() {
    let category = document.getElementById("categorySelect").value;
    let numQuestions = parseInt(document.getElementById("customNumQuestions").value) || 10;
    let includeAnswered = document.getElementById("includeAnsweredCheckbox").checked;
    document.getElementById("customQuizForm").style.display = "none";
    loadQuestions({
      type: 'custom',
      category: category,
      num: numQuestions,
      includeAnswered: includeAnswered
    });
  });
  
  // CANCEL QUIZ (Custom)
  document.getElementById("cancelCustomQuiz").addEventListener("click", function() {
    document.getElementById("customQuizForm").style.display = "none";
  });
  
  // START QUIZ (Random) => hide modal, load quiz
  document.getElementById("startRandomQuiz").addEventListener("click", function() {
    let numQuestions = parseInt(document.getElementById("randomNumQuestions").value) || 10;
    let includeAnswered = document.getElementById("includeAnsweredRandomCheckbox").checked;
    document.getElementById("randomQuizForm").style.display = "none";
    loadQuestions({
      type: 'random',
      num: numQuestions,
      includeAnswered: includeAnswered
    });
  });
  
  // CANCEL QUIZ (Random)
  document.getElementById("cancelRandomQuiz").addEventListener("click", function() {
    document.getElementById("randomQuizForm").style.display = "none";
  });
  
  // BOOKMARKS => now simply close the menu
  document.getElementById("bookmarksFilter").addEventListener("click", function(e) {
    e.preventDefault();
    closeSideMenu();
  });
  
  // START NEW QUIZ from side menu
  document.getElementById("startNewQuiz").addEventListener("click", function() {
    closeSideMenu();
    window.filterMode = "all";
    document.querySelector(".swiper").style.display = "none";
    document.getElementById("bottomToolbar").style.display = "none";
    document.getElementById("iconBar").style.display = "none";
    document.getElementById("performanceView").style.display = "none";
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("faqView").style.display = "none";
    document.getElementById("aboutView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
  });
  
  // LEADERBOARD
  document.getElementById("leaderboardItem").addEventListener("click", function() {
    closeSideMenu();
    showLeaderboard();
  });
  
  // PERFORMANCE (removed from left menu, now only in user menu)
  
  // FAQ
  document.getElementById("faqItem").addEventListener("click", function() {
    closeSideMenu();
    showFAQ();
  });
  
  // ABOUT US
  document.getElementById("aboutItem").addEventListener("click", function() {
    closeSideMenu();
    showAbout();
  });
  
  // CONTACT US
  document.getElementById("contactItem").addEventListener("click", function() {
    closeSideMenu();
    document.querySelector(".swiper").style.display = "none";
    document.getElementById("bottomToolbar").style.display = "none";
    document.getElementById("iconBar").style.display = "none";
    document.getElementById("performanceView").style.display = "none";
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("aboutView").style.display = "none";
    document.getElementById("faqView").style.display = "none";
    document.getElementById("mainOptions").style.display = "none";
    showContactModal();
  });
  
  // Side menu toggling
  document.getElementById("menuToggle").addEventListener("click", function() {
    document.getElementById("sideMenu").classList.add("open");
    document.getElementById("menuOverlay").classList.add("show");
  });
  
  document.getElementById("menuClose").addEventListener("click", function() {
    closeSideMenu();
  });
  
  document.getElementById("menuOverlay").addEventListener("click", function() {
    closeSideMenu();
    closeUserMenu();
  });
  
  // RESET PROGRESS (removed from left menu, now only in user menu)
  
  // Logo click => go to main menu
  document.getElementById("logoClick").addEventListener("click", function() {
    closeSideMenu();
    closeUserMenu();
    document.getElementById("aboutView").style.display = "none";
    document.getElementById("faqView").style.display = "none";
    document.querySelector(".swiper").style.display = "none";
    document.getElementById("bottomToolbar").style.display = "none";
    document.getElementById("iconBar").style.display = "none";
    document.getElementById("performanceView").style.display = "none";
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
  });
  
  // FEEDBACK button
  document.getElementById("feedbackButton").addEventListener("click", function() {
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
    document.getElementById("feedbackQuestionInfo").textContent = `Feedback for Q: ${currentFeedbackQuestionText}`;
    document.getElementById("feedbackModal").style.display = "flex";
  });
  
  // FEEDBACK modal close
  document.getElementById("closeFeedbackModal").addEventListener("click", function() {
    document.getElementById("feedbackModal").style.display = "none";
  });
  
  // FEEDBACK submit
  document.getElementById("submitFeedback").addEventListener("click", async function() {
    const feedbackText = document.getElementById("feedbackText").value.trim();
    if (!feedbackText) {
      alert("Please enter your feedback.");
      return;
    }
    try {
      await window.addDoc(window.collection(window.db, "feedback"), {
        questionId: currentFeedbackQuestionId,
        questionText: currentFeedbackQuestionText,
        feedback: feedbackText,
        timestamp: window.serverTimestamp()
      });
      alert("Thank you for your feedback!");
      document.getElementById("feedbackText").value = "";
      document.getElementById("feedbackModal").style.display = "none";
    } catch (error) {
      console.error("Error submitting feedback:", error);
      alert("There was an error submitting your feedback. Please try again later.");
    }
  });
  
  // FAVORITE button
  document.getElementById("favoriteButton").addEventListener("click", async function() {
    let questionId = getCurrentQuestionId();
    if (!questionId) return;
    let bookmarks = await getBookmarks();
    if (!bookmarks.includes(questionId.trim())) {
      await toggleBookmark(questionId.trim());
      document.getElementById("favoriteButton").innerText = "★";
      document.getElementById("favoriteButton").style.color = "blue";
    }
  });
  
  // CONTACT modal buttons
  document.getElementById("submitContact").addEventListener("click", async function() {
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();
    
    if (!message) {
      alert("Please enter your message.");
      return;
    }
    
    try {
      await window.addDoc(window.collection(window.db, "contact"), {
        email: email,
        message: message,
        timestamp: window.serverTimestamp(),
        userId: window.auth.currentUser.uid
      });
      alert("Thank you for contacting us!");
      document.getElementById("contactEmail").value = "";
      document.getElementById("contactMessage").value = "";
      document.getElementById("contactModal").style.display = "none";
    } catch (error) {
      console.error("Error submitting contact:", error);
      alert("There was an error submitting your message. Please try again later.");
    }
  });
  
  document.getElementById("closeContactModal").addEventListener("click", function() {
    document.getElementById("contactModal").style.display = "none";
  });

  // Update the composite score on load
  updateUserCompositeScore();
});
