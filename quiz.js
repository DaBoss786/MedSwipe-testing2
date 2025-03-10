// Quiz management variables
let allQuestions = [];
let selectedCategory = "";
let answeredIds = [];
let currentQuestion = 0;
let totalQuestions = 0;
let score = 0;
let currentFeedbackQuestionId = "";
let currentFeedbackQuestionText = "";
let sessionStartXP = 0;
let summarySlideCreated = false;

// Fetch questions from CSV
async function fetchQuestionBank() {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: function(results) {
        resolve(results.data);
      },
      error: function(error) {
        reject(error);
      }
    });
  });
}

// Load questions according to quiz options
async function loadQuestions(options = {}) {
  console.log("Loading questions with options:", options);
  Papa.parse(csvUrl, {
    download: true,
    header: true,
    complete: async function(results) {
      console.log("Questions loaded:", results.data.length);
      allQuestions = results.data;
      const persistentAnsweredIds = await fetchPersistentAnsweredIds();
      answeredIds = persistentAnsweredIds;
      
      // Start with all questions
      let filtered = allQuestions;
      
      // Filter by bookmarks if in bookmarks mode
      if (options.bookmarksOnly) {
        const bookmarks = await getBookmarks();
        console.log("Filtering for bookmarks:", bookmarks);
        if (bookmarks.length === 0) {
          alert("You don't have any bookmarks yet. Star questions you want to review later!");
          document.getElementById("mainOptions").style.display = "flex";
          return;
        }
        filtered = filtered.filter(q => bookmarks.includes(q["Question"].trim()));
      } 
      // Otherwise apply normal filters
      else {
        if (!options.includeAnswered) {
          filtered = filtered.filter(q => !answeredIds.includes(q["Question"].trim()));
        }
        if (options.type === 'custom' && options.category) {
          filtered = filtered.filter(q => q["Category"] && q["Category"].trim() === options.category);
        }
      }
      
      // If we end up with no questions after filtering
      if (filtered.length === 0) {
        if (options.bookmarksOnly) {
          alert("No bookmarked questions found. Star questions you want to review later!");
        } else if (options.type === 'custom' && options.category) {
          alert("No unanswered questions left in this category. Try including answered questions or choosing a different category.");
        } else {
          alert("No unanswered questions left. Try including answered questions for more practice!");
        }
        document.getElementById("mainOptions").style.display = "flex";
        return;
      }
      
      // Shuffle and slice to limit question count
      let selectedQuestions = shuffleArray(filtered);
      if (options.num && options.num < selectedQuestions.length) {
        selectedQuestions = selectedQuestions.slice(0, options.num);
      }
      
      console.log("Selected questions count:", selectedQuestions.length);
      initializeQuiz(selectedQuestions);
    },
    error: function(error) {
      console.error("Error parsing CSV:", error);
      alert("Error loading questions. Please try again later.");
    }
  });
}

// Initialize the quiz with the selected questions
async function initializeQuiz(questions) {
  // Reset summary slide flag
  summarySlideCreated = false;
  
  // Get starting XP before the quiz begins
  try {
    if (window.auth && window.auth.currentUser) {
      const uid = window.auth.currentUser.uid;
      const userDocRef = window.doc(window.db, 'users', uid);
      const userDocSnap = await window.getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        sessionStartXP = data.stats?.xp || 0;
        console.log("Quiz starting XP:", sessionStartXP);
      }
    }
  } catch (error) {
    console.error("Error getting starting XP:", error);
    sessionStartXP = 0;
  }
  
  currentQuestion = 0;
  score = 0;
  totalQuestions = questions.length;
  answeredIds = [];
  updateProgress();
  
  // Get bookmarks to show the filled star for bookmarked questions
  const bookmarks = await getBookmarks();
  
  const quizSlides = document.getElementById("quizSlides");
  quizSlides.innerHTML = "";
  questions.forEach(question => {
    const questionSlide = document.createElement("div");
    questionSlide.className = "swiper-slide";
    const qId = question["Question"].trim();
    questionSlide.dataset.id = qId;
    questionSlide.dataset.correct = question["Correct Answer"].trim();
    questionSlide.dataset.explanation = question["Explanation"];
    questionSlide.dataset.category = question["Category"] || "Uncategorized";
    questionSlide.dataset.bookmarked = bookmarks.includes(qId) ? "true" : "false";
    
    questionSlide.innerHTML = `
      <div class="card">
        <div class="question">${question["Question"]}</div>
        ${question["Image URL"] && question["Image URL"].trim() !== ""
          ? `<img src="${question["Image URL"].trim()}" class="question-image">`
          : "" }
        <div class="options">
          ${question["Option A"] && question["Option A"].trim() !== ""
            ? `<button class="option-btn" data-option="A">A. ${question["Option A"]}</button>`
            : "" }
          ${question["Option B"] && question["Option B"].trim() !== ""
            ? `<button class="option-btn" data-option="B">B. ${question["Option B"]}</button>`
            : "" }
          ${question["Option C"] && question["Option C"].trim() !== ""
            ? `<button class="option-btn" data-option="C">C. ${question["Option C"]}</button>`
            : "" }
          ${question["Option D"] && question["Option D"].trim() !== ""
            ? `<button class="option-btn" data-option="D">D. ${question["Option D"]}</button>`
            : "" }
          ${question["Option E"] && question["Option E"] !== ""
            ? `<button class="option-btn" data-option="E">E. ${question["Option E"]}</button>`
            : "" }
        </div>
        <div class="swipe-hint" style="display:none;">Swipe up for explanation</div>
      </div>
    `;
    quizSlides.appendChild(questionSlide);
    const answerSlide = document.createElement("div");
    answerSlide.className = "swiper-slide";
    answerSlide.innerHTML = `
      <div class="card">
        <div class="answer"></div>
        <p class="swipe-next-hint">Swipe up for next question</p>
      </div>
    `;
    quizSlides.appendChild(answerSlide);
  });

  window.mySwiper = new Swiper('.swiper', {
    direction: 'vertical',
    loop: false,
    mousewheel: true,
    touchReleaseOnEdges: true
  });

  window.mySwiper.on('slideChangeTransitionEnd', function() {
    const activeIndex = window.mySwiper.activeIndex;
    const previousIndex = window.mySwiper.previousIndex;
    if (activeIndex % 2 === 0) {
      questionStartTime = Date.now();
      console.log("New question slide. questionStartTime updated to:", questionStartTime);
      updateBookmarkIcon();
    }
    if (activeIndex % 2 === 1 && activeIndex > previousIndex) {
      const prevSlide = window.mySwiper.slides[activeIndex - 1];
      const card = prevSlide.querySelector('.card');
      if (!card.classList.contains('answered')) {
        window.mySwiper.slideNext();
      }
    }
  });

  addOptionListeners();
  
  // Set the initial bookmark icon state for the first question
  updateBookmarkIcon();

  document.querySelector(".swiper").style.display = "block";
  document.getElementById("bottomToolbar").style.display = "flex";
  document.getElementById("mainOptions").style.display = "none";
  document.getElementById("performanceView").style.display = "none";
  document.getElementById("iconBar").style.display = "flex";
  document.getElementById("aboutView").style.display = "none";
  document.getElementById("faqView").style.display = "none";
}

// Update the bookmark icon based on the current question's bookmark status
function updateBookmarkIcon() {
  const favoriteButton = document.getElementById("favoriteButton");
  if (!favoriteButton) return;
  
  const questionId = getCurrentQuestionId();
  if (!questionId) {
    favoriteButton.innerText = "☆";
    favoriteButton.style.color = "";
    return;
  }
  
  const currentSlide = document.querySelector(`.swiper-slide[data-id="${questionId}"]`);
  if (currentSlide && currentSlide.dataset.bookmarked === "true") {
    favoriteButton.innerText = "★";
    favoriteButton.style.color = "#007BFF"; // Blue color for bookmarked items
  } else {
    favoriteButton.innerText = "☆";
    favoriteButton.style.color = "";
  }
}

// Add click event listeners to quiz options
function addOptionListeners() {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const card = this.closest('.card');
      if (card.classList.contains('answered')) return;
      card.classList.add('answered');
      const questionSlide = card.closest('.swiper-slide');
      const qId = questionSlide.dataset.id;
      if (!answeredIds.includes(qId)) { answeredIds.push(qId); }
      const correct = questionSlide.dataset.correct;
      const explanation = questionSlide.dataset.explanation;
      const category = questionSlide.dataset.category;
      const options = card.querySelectorAll('.option-btn');
      const selected = this.getAttribute('data-option');
      const isCorrect = (selected === correct);
      const timeSpent = Date.now() - questionStartTime;
      if (window.analytics && window.logEvent) {
        window.logEvent(window.analytics, 'question_answered', { questionId: qId, isCorrect });
      }
      options.forEach(option => {
        option.disabled = true;
        if (option.getAttribute('data-option') === correct) {
          option.classList.add('correct');
        }
      });
      if (!isCorrect) { this.classList.add('incorrect'); }
      const hint = card.querySelector('.swipe-hint');
      if (hint) { hint.style.display = 'block'; }
      const answerSlide = questionSlide.nextElementSibling;
      if (answerSlide) {
        answerSlide.querySelector('.card').innerHTML = `
          <div class="answer">
            <strong>You got it ${isCorrect ? "Correct" : "Incorrect"}</strong><br>
            Correct Answer: ${correct}<br>
            ${explanation}
          </div>
          <p class="swipe-next-hint">Swipe up for next question</p>
        `;
      }
      currentQuestion++;
      if (isCorrect) { score++; }
      updateProgress();
      await recordAnswer(qId, category, isCorrect, timeSpent);
      await updateQuestionStats(qId, isCorrect);
      
      if (currentQuestion === totalQuestions) {
        // Calculate the index of the last explanation slide
        const lastQuestionIndex = (totalQuestions - 1) * 2; // Index of the last question
        const lastExplanationIndex = lastQuestionIndex + 1; // Index of its explanation
        
        // Add loading message to the last explanation slide
        const lastExplanationSlide = window.mySwiper.slides[lastExplanationIndex];
        if (lastExplanationSlide && lastExplanationSlide.querySelector(".card")) {
          const loadingMessage = document.createElement("p");
          loadingMessage.id = "summaryLoadingMessage";
          loadingMessage.textContent = "Preparing summary...";
          loadingMessage.style.textAlign = "center";
          loadingMessage.style.color = "#0056b3";
          loadingMessage.style.margin = "15px 0";
          loadingMessage.style.fontWeight = "bold";
          lastExplanationSlide.querySelector(".card").appendChild(loadingMessage);
        }
        
        // Start loading the summary data
        loadSummaryData();
      }
    });
  });
}

// Load summary data and create the button when ready
async function loadSummaryData() {
  // Don't create the summary slide yet - just load the data
  let sessionXP = 0;
  let currentLevel = 1;
  let currentXP = 0;
  
  try {
    if (window.auth && window.auth.currentUser) {
      const uid = window.auth.currentUser.uid;
      const userDocRef = window.doc(window.db, 'users', uid);
      const userDocSnap = await window.getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        if (data.stats) {
          currentXP = data.stats.xp || 0;
          currentLevel = data.stats.level || 1;
          
          // Calculate actual XP earned by comparing end XP with start XP
          sessionXP = currentXP - sessionStartXP;
          console.log("Quiz XP calculation:", currentXP, "-", sessionStartXP, "=", sessionXP);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching user data for summary:", error);
    // Fallback to base calculation if there's an error
    const baseXP = score * 3;
    const incorrectXP = (totalQuestions - score);
    sessionXP = baseXP + incorrectXP;
  }
  
  // Calculate accuracy percentage
  const accuracy = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  
  // Get appropriate message based on performance
  let performanceMessage = "";
  if (accuracy >= 90) {
    performanceMessage = "Excellent work! You're mastering this material!";
  } else if (accuracy >= 70) {
    performanceMessage = "Great job! Keep up the good work!";
  } else if (accuracy >= 50) {
    performanceMessage = "Good effort! Keep practicing to improve!";
  } else {
    performanceMessage = "Keep practicing! You'll improve with time.";
  }
  
  // Save the data for later - we won't create the slide yet
  window.summaryData = {
    sessionXP,
    currentLevel,
    currentXP,
    accuracy,
    performanceMessage
  };
  
  // Find the last explanation slide to update the UI
  const lastQuestionIndex = (totalQuestions - 1) * 2;
  const lastExplanationIndex = lastQuestionIndex + 1;
  const lastExplanationSlide = window.mySwiper.slides[lastExplanationIndex];
  
  if (lastExplanationSlide) {
    // Remove the loading message
    const loadingMessage = document.getElementById("summaryLoadingMessage");
    if (loadingMessage) {
      loadingMessage.remove();
    }
    
    // Add a button to view the summary
    const viewSummaryButton = document.createElement("button");
    viewSummaryButton.id = "viewSummaryButton";
    viewSummaryButton.textContent = "View Quiz Summary";
    viewSummaryButton.style.padding = "10px 20px";
    viewSummaryButton.style.backgroundColor = "#0056b3";
    viewSummaryButton.style.color = "white";
    viewSummaryButton.style.border = "none";
    viewSummaryButton.style.borderRadius = "5px";
    viewSummaryButton.style.margin = "20px auto";
    viewSummaryButton.style.display = "block";
    viewSummaryButton.style.cursor = "pointer";
    
    // Add click handler to create and navigate to summary slide
    viewSummaryButton.addEventListener("click", createAndShowSummarySlide);
    
    lastExplanationSlide.querySelector(".card").appendChild(viewSummaryButton);
  }
}

// Function to create and show summary slide (called when button is clicked)
function createAndShowSummarySlide() {
  // Only create the slide if it hasn't been created yet
  if (!summarySlideCreated) {
    // Get the data we saved earlier
    const { sessionXP, currentLevel, currentXP, accuracy, performanceMessage } = window.summaryData;
    
    // Create summary slide
    const summarySlide = document.createElement("div");
    summarySlide.className = "swiper-slide summary-slide";
    summarySlide.innerHTML = `
      <div class="card quiz-summary-card">
        <div class="summary-header">
          <h2>Quiz Complete!</h2>
        </div>
        
        <div class="summary-score">
          <div class="score-circle" style="background: conic-gradient(#28a745 ${accuracy}%, #f0f0f0 0);">
            <span>${accuracy}%</span>
          </div>
          <div class="score-text">
            <p><strong>${score} / ${totalQuestions}</strong> correct</p>
            <p>${performanceMessage}</p>
          </div>
        </div>
        
        <div class="summary-xp">
          <div class="xp-header">XP Earned This Session</div>
          <div class="xp-value">+${sessionXP} XP</div>
          <div class="xp-bar-container">
            <div class="xp-bar" style="width: ${sessionXP}%;"></div>
          </div>
          <div class="xp-total">Total: ${currentXP} XP (Level ${currentLevel})</div>
        </div>
        
        <div class="summary-buttons">
          <button id="startNewQuizButton" class="start-quiz-btn">Start New Quiz</button>
          <button id="leaderboardButton" class="start-quiz-btn">View Leaderboard</button>
        </div>
      </div>
    `;
    
    // Add the slide to the DOM
    document.getElementById("quizSlides").appendChild(summarySlide);
    
    // Update swiper to recognize the new slide
    window.mySwiper.update();
    
    // Mark that the slide has been created
    summarySlideCreated = true;
    
    // Add event listeners to buttons
    document.getElementById("startNewQuizButton").addEventListener("click", function() {
      window.filterMode = "all";
      document.getElementById("aboutView").style.display = "none";
      document.getElementById("faqView").style.display = "none";
      document.querySelector(".swiper").style.display = "none";
      document.getElementById("bottomToolbar").style.display = "none";
      document.getElementById("iconBar").style.display = "none";
      document.getElementById("performanceView").style.display = "none";
      document.getElementById("leaderboardView").style.display = "none";
      document.getElementById("mainOptions").style.display = "flex";
    });
    
    document.getElementById("leaderboardButton").addEventListener("click", function() {
      document.getElementById("aboutView").style.display = "none";
      document.getElementById("faqView").style.display = "none";
      document.querySelector(".swiper").style.display = "none";
      document.getElementById("bottomToolbar").style.display = "none";
      document.getElementById("iconBar").style.display = "none";
      document.getElementById("performanceView").style.display = "none";
      document.getElementById("faqView").style.display = "none";
      document.getElementById("mainOptions").style.display = "none";
      showLeaderboard();
    });
  }
  
  // Navigate to the summary slide (last slide)
  const summaryIndex = window.mySwiper.slides.length - 1;
  window.mySwiper.slideTo(summaryIndex);
}

// Update quiz progress and score displays
function updateProgress() {
  const progressPercent = totalQuestions > 0 ? (currentQuestion / totalQuestions) * 100 : 0;
  document.getElementById("progressBar").style.width = progressPercent + "%";
  document.getElementById("questionProgress").textContent = `${currentQuestion} / ${totalQuestions}`;
  document.getElementById("scoreDisplay").textContent = `Score: ${score}`;
  localStorage.setItem("quizProgress", JSON.stringify({
    quizData: allQuestions,
    currentQuestion,
    score,
    answeredIds,
    filterMode: window.filterMode,
    selectedCategory
  }));
  
  // Use the new function name
  if (typeof updateUserXP === 'function') {
    updateUserXP();
  }
}
