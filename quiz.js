// quiz.js - Final Verified Version

import { auth, db, doc, getDoc, collection, getDocs, query, where, analytics, logEvent } from './firebase-config.js';
// --- VERIFIED IMPORTS: These now correctly match the exports from the fixed user.v2.js ---
import { recordAnswer, getBookmarks, updateSpacedRepetitionData, fetchSpacedRepetitionData, recordCmeAnswer } from './user.v2.js';
import { shuffleArray, getCurrentQuestionId } from './utils.js';
import { showLeaderboard } from './ui.js';

// Quiz management variables
let swiper;
let allQuestions = [];
let questionStartTime = 0;
let answeredInSession = [];
let currentQuizType = 'regular';
let sessionStartXP = 0;
let score = 0;
let totalQuestions = 0;

// Fetch the entire question bank from Firestore (with caching)
async function fetchQuestionBank() {
    if (allQuestions.length > 0) {
        return allQuestions;
    }
    console.log("Fetching question bank from Firestore...");
    try {
        const questionsCollectionRef = collection(db, "questions");
        const querySnapshot = await getDocs(questionsCollectionRef);
        const questions = querySnapshot.docs.map(doc => doc.data());
        allQuestions = questions;
        console.log(`Successfully fetched ${allQuestions.length} questions from Firestore.`);
        return allQuestions;
    } catch (error) {
        console.error("Error fetching question bank from Firestore:", error);
        return [];
    }
}

// Load questions based on selected options
async function loadQuestions(options = {}) {
    console.log("Loading questions with options:", options);
    window.isOnboardingQuiz = options.isOnboarding || false;
    currentQuizType = options.quizType || (options.isOnboarding ? 'onboarding' : 'regular');

    if (analytics && logEvent) {
        logEvent(analytics, 'quiz_start', {
            quiz_type: currentQuizType,
            category: options.category || 'all',
            num_questions: options.num || 10,
            user_tier: window.authState?.accessTier || 'free_guest',
            board_review_only: !!options.boardReviewOnly,
            spaced_repetition: !!options.spacedRepetition
        });
    }

    try {
        const questionBank = await fetchQuestionBank();
        if (questionBank.length === 0) {
            alert("Could not load questions. Please try again later.");
            return;
        }

        let filteredQuestions = [...questionBank];

        // --- Spaced Repetition Logic ---
        if (options.spacedRepetition) {
            if (auth.currentUser && !auth.currentUser.isAnonymous) {
                const spacedRepData = await fetchSpacedRepetitionData();
                const now = new Date();
                const dueQuestionIds = Object.keys(spacedRepData).filter(qId => new Date(spacedRepData[qId].nextReviewDate) <= now);
                const dueQuestions = filteredQuestions.filter(q => dueQuestionIds.includes(q.Question.trim()));
                const newQuestions = filteredQuestions.filter(q => !spacedRepData[q.Question.trim()]);
                filteredQuestions = [...shuffleArray(dueQuestions), ...shuffleArray(newQuestions)];
                console.log(`Spaced Repetition: ${dueQuestions.length} due, ${newQuestions.length} new.`);
            } else {
                alert("Spaced repetition is a premium feature. Please create a free account to use it.");
                if (typeof window.showRegistrationBenefitsModal === 'function') {
                    window.showRegistrationBenefitsModal();
                }
                return; // Stop quiz load
            }
        }

        // --- Other Filtering Logic ---
        if (options.bookmarksOnly) {
            const bookmarks = await getBookmarks();
            filteredQuestions = filteredQuestions.filter(q => bookmarks.includes(q.Question.trim()));
        } else if (options.reviewIncorrectCmeOnly) {
            filteredQuestions = filteredQuestions.filter(q => options.incorrectCmeQuestionIds.includes(q.Question.trim()));
        }

        if (options.category) {
            filteredQuestions = filteredQuestions.filter(q => q.Category === options.category);
        }

        if (options.boardReviewOnly) {
            filteredQuestions = filteredQuestions.filter(q => q["Board Review Question"] === true);
        }

        if (options.quizType === 'cme') {
            filteredQuestions = filteredQuestions.filter(q => {
                const cmeEligibleValue = q["CME Eligible"];
                return cmeEligibleValue === true || String(cmeEligibleValue).trim().toLowerCase() === 'yes';
            });
        }

        // Filter out questions already answered in this session to avoid repeats
        if (!options.includeAnswered) {
            filteredQuestions = filteredQuestions.filter(q => !answeredInSession.includes(q.Question.trim()));
        }

        let selectedQuestions = shuffleArray(filteredQuestions).slice(0, options.num || 10);

        if (selectedQuestions.length === 0) {
            alert("No questions found matching your criteria. Try adjusting your filters.");
            return;
        }

        initializeQuiz(selectedQuestions);

    } catch (error) {
        console.error("Error in loadQuestions:", error);
        alert("An error occurred while preparing your quiz.");
    }
}

// Initialize the quiz UI
async function initializeQuiz(questions) {
    answeredInSession = [];
    score = 0;
    totalQuestions = questions.length;
    sessionStartXP = window.authState?.user?.stats?.xp || 0; // Get starting XP

    const quizSlides = document.getElementById("quizSlides");
    quizSlides.innerHTML = "";
    questions.forEach((q, index) => {
        quizSlides.appendChild(createQuestionSlide(q, index, questions.length));
    });

    // Show quiz UI
    document.querySelector(".swiper").style.display = "block";
    document.getElementById("bottomToolbar").style.display = "flex";
    document.getElementById("iconBar").style.display = "flex";
    document.getElementById("mainOptions").style.display = "none";

    // Setup Swiper
    if (swiper) swiper.destroy(true, true);
    swiper = new Swiper(".swiper", {
        effect: "cards",
        grabCursor: true,
        on: {
            slideChange: () => {
                updateProgressBar(swiper.activeIndex, swiper.slides.length);
                updateBookmarkIcon();
                questionStartTime = Date.now();
            },
            reachEnd: () => setTimeout(showQuizEndScreen, 800),
        },
    });

    updateProgressBar(0, questions.length);
    updateBookmarkIcon();
    questionStartTime = Date.now();
}

// Create a single question slide element
function createQuestionSlide(q, index, total) {
    const slide = document.createElement("div");
    slide.className = "swiper-slide";
    slide.dataset.id = q.Question.trim();
    slide.dataset.category = q.Category;
    slide.dataset.cmeEligible = q["CME Eligible"] === true || String(q["CME Eligible"]).trim().toLowerCase() === 'yes';

    const options = shuffleArray([q.Correct, q.Incorrect1, q.Incorrect2, q.Incorrect3]);
    const optionsHTML = options.map(opt => `<button class="option">${opt}</button>`).join('');

    slide.innerHTML = `
        <div class="question-container">
            <div class="question-header">Question ${index + 1} of ${total}</div>
            <div class="question">${q.Question}</div>
            <div class="options-container">${optionsHTML}</div>
            <div class="explanation" style="display:none;">
                <h4>Explanation</h4>
                <p>${q.Explanation}</p>
                <div class="difficulty-buttons">
                    <p class="difficulty-prompt">How difficult was this question?</p>
                    <div class="difficulty-btn-container">
                        <button class="difficulty-btn easy-btn" data-difficulty="easy">Easy</button>
                        <button class="difficulty-btn medium-btn" data-difficulty="medium">Medium</button>
                        <button class="difficulty-btn hard-btn" data-difficulty="hard">Hard</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    slide.querySelectorAll(".option").forEach(button => {
        button.addEventListener("click", () => handleOptionClick(button, q.Correct, slide));
    });

    return slide;
}

// Handle when a user clicks an answer option
async function handleOptionClick(button, correctAnswer, slide) {
    if (slide.dataset.answered) return;
    slide.dataset.answered = "true";

    const timeSpent = (Date.now() - questionStartTime) / 1000;
    const questionId = slide.dataset.id;
    const category = slide.dataset.category;
    const isCorrect = button.textContent === correctAnswer;

    if (isCorrect) score++;
    answeredInSession.push(questionId);

    // Visually update options
    slide.querySelectorAll(".option").forEach(opt => {
        opt.disabled = true;
        opt.classList.add(opt.textContent === correctAnswer ? "correct" : "incorrect");
    });
    if (!isCorrect) button.classList.add("selected-incorrect");

    // Show explanation and difficulty buttons
    const explanationDiv = slide.querySelector(".explanation");
    if (explanationDiv) explanationDiv.style.display = "block";
    addDifficultyListeners(explanationDiv, questionId, isCorrect);

    // Call the main recordAnswer function from user.v2.js
    // This securely handles game stats and also triggers the separate CME recording if needed.
    await recordAnswer(questionId, category, isCorrect, timeSpent);

    // Advance to next slide
    setTimeout(() => {
        if (swiper && !swiper.isEnd) swiper.slideNext();
    }, 2500);
}

// Add listeners to difficulty buttons
function addDifficultyListeners(container, questionId, isCorrect) {
    container.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const difficulty = this.dataset.difficulty;
            let nextReviewInterval = 1; // Default
            if (isCorrect) {
                if (difficulty === 'easy') nextReviewInterval = 7;
                else if (difficulty === 'medium') nextReviewInterval = 3;
            }
            // Securely update spaced repetition data
            await updateSpacedRepetitionData(questionId, isCorrect, difficulty, nextReviewInterval);

            // UI feedback
            this.parentElement.innerHTML = `<p class="review-scheduled">Review scheduled in ${nextReviewInterval} day(s).</p>`;
        });
    });
}

// Show the final summary screen
function showQuizEndScreen() {
    const swiperContainer = document.querySelector(".swiper");
    if (!swiperContainer) return;

    const accuracy = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    let performanceMessage = "Keep practicing!";
    if (accuracy >= 90) performanceMessage = "Excellent work!";
    else if (accuracy >= 70) performanceMessage = "Great job!";

    swiperContainer.innerHTML = `
        <div class="quiz-end-screen">
            <h2>Quiz Complete!</h2>
            <p>You scored ${score} out of ${totalQuestions} (${accuracy}%).</p>
            <p>${performanceMessage}</p>
            <button id="backToMenuBtn">Back to Main Menu</button>
        </div>
    `;

    document.getElementById("backToMenuBtn").addEventListener("click", () => {
        swiperContainer.style.display = "none";
        document.getElementById("bottomToolbar").style.display = "none";
        document.getElementById("iconBar").style.display = "none";
        document.getElementById("mainOptions").style.display = "flex";
    });
}

// UI Helper Functions
function updateProgressBar(currentIndex, totalSlides) {
    const progress = totalSlides > 0 ? ((currentIndex + 1) / totalSlides) * 100 : 0;
    document.getElementById("progressBar").style.width = `${progress}%`;
    document.getElementById("questionProgress").textContent = `${currentIndex + 1} / ${totalSlides}`;
}

async function updateBookmarkIcon() {
    const favoriteButton = document.getElementById("favoriteButton");
    const questionId = getCurrentQuestionId();
    if (!favoriteButton || !questionId) return;

    const bookmarks = await getBookmarks();
    if (bookmarks.includes(questionId.trim())) {
        favoriteButton.innerText = "★";
        favoriteButton.style.color = "#007BFF";
    } else {
        favoriteButton.innerText = "☆";
        favoriteButton.style.color = "";
    }
}

export { loadQuestions, initializeQuiz, fetchQuestionBank };