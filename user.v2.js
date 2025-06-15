// user.v2.js
import { auth, db, doc, getDoc, serverTimestamp, functions, httpsCallable, setDoc } from './firebase-config.js';

// --- MODIFIED & CORRECTED: All required function references are now defined here ---
let recordAnswerFunction;         // For the main game stats
let recordCmeAnswerFunction;      // For the separate CME stat recording
let updateUserProfileFunction;    // For secure profile updates
let upgradeAnonymousAccountFunction; // For secure guest upgrades (though not used in this file, good practice to know it exists)

try {
    // This points to the NEW 'recordAnswer' Cloud Function for game stats
    recordAnswerFunction = httpsCallable(functions, 'recordAnswer');

    // This points to the EXISTING 'recordCmeAnswerV2' Cloud Function for CME
    recordCmeAnswerFunction = httpsCallable(functions, 'recordCmeAnswerV2');

    // This points to the 'updateUserProfile' Cloud Function
    updateUserProfileFunction = httpsCallable(functions, 'updateUserProfile');

    console.log("All callable function references created successfully in user.v2.js.");
} catch (error) {
    console.error("Error creating callable function references in user.v2.js:", error);
    // This is a critical failure, alert the user.
    alert("A critical error occurred while initializing the application's services. Please refresh the page.");
}
// --- END OF CORRECTION ---


// This is the NEW, simplified client-side function for game stats.
async function recordAnswer(questionId, category, isCorrect, timeSpent) {
    // This check now works because recordAnswerFunction is correctly defined above.
    if (!auth || !auth.currentUser || !recordAnswerFunction) {
        console.log("User not authenticated or game service not available, can't record answer");
        return;
    }

    // Optimistic UI update can go here if desired.

    try {
        console.log(`Calling 'recordAnswer' Cloud Function for QID: ${questionId.substring(0, 50)}...`);
        const result = await recordAnswerFunction({
            questionId,
            category,
            isCorrect,
            timeSpent
        });

        const data = result.data;
        if (data && data.success) {
            console.log("Server successfully recorded game answer.", data);
            // Trigger a full UI refresh with the real data from the server.
            if (typeof window.updateUserXP === 'function') window.updateUserXP();
            if (typeof window.updateUserMenu === 'function') window.updateUserMenu();
            if (typeof window.initializeDashboard === 'function') window.initializeDashboard();

            if (data.levelUp) {
                setTimeout(() => {
                    showLevelUpAnimation(data.newLevel, data.totalXP);
                }, 1000);
            }
        } else {
            console.error("Server returned an error while recording game answer:", data);
        }

    } catch (error) {
        console.error("Error calling 'recordAnswer' Cloud Function:", error);
        alert(`An error occurred while saving your progress: ${error.message}`);
    }

    // This part calls the SEPARATE CME function if the user is eligible.
    // It was correct before, but now the whole system will work.
    if (window.authState.accessTier === "cme_annual" || window.authState.accessTier === "cme_credits_only") {
        if (typeof recordCmeAnswer === 'function') {
            // This calls the recordCmeAnswer function below, NOT the cloud function directly.
            recordCmeAnswer(questionId, category, isCorrect, timeSpent);
        }
    }

    if (auth.currentUser.isAnonymous && typeof window.checkRegistrationPrompt === 'function') {
        window.checkRegistrationPrompt();
    }
}

// This is the existing, unchanged function for recording CME-specific stats.
// It was failing because its own function reference was missing.
async function recordCmeAnswer(questionId, category, isCorrect, timeSpent) {
    if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) {
      console.log("User not authenticated or is guest; CME answer not submitted to CF.");
      return;
    }

    // This check now works because recordCmeAnswerFunction is correctly defined above.
    if (!recordCmeAnswerFunction) {
      console.error("recordCmeAnswer Cloud Function reference is not available. Cannot record CME answer.");
      alert("There was a problem connecting to the CME recording service. Please try again later.");
      return;
    }

    const uid = auth.currentUser.uid;
    console.log(`Calling Cloud Function (target: recordCmeAnswerV2) for user ${uid}, QID: ${questionId.substring(0,50)}...`);

    try {
      const dataToSend = {
        questionId: questionId,
        category: category,
        isCorrect: isCorrect,
        timeSpent: timeSpent,
      };

      const result = await recordCmeAnswerFunction(dataToSend);
      const cfResponse = result.data;

      console.log("Cloud Function 'recordCmeAnswerV2' raw response:", JSON.stringify(cfResponse, null, 2));

      if (cfResponse && cfResponse.activeYearId && typeof window.setActiveCmeYearClientSide === 'function') {
          window.setActiveCmeYearClientSide(cfResponse.activeYearId);
      }

      if (typeof window.loadCmeDashboardData === 'function') {
           window.loadCmeDashboardData();
      }
      if (typeof window.initializeDashboard === 'function') {
            const mainOptionsEl = document.getElementById('mainOptions');
            if (mainOptionsEl && mainOptionsEl.style.display !== 'none') {
                window.initializeDashboard();
            }
      }

    } catch (error) {
      console.error("Error calling 'recordCmeAnswerV2' Cloud Function:", error);
      alert(`An error occurred while recording your CME answer: ${error.message}`);
    }
}


// --- ALL OTHER FUNCTIONS BELOW THIS LINE ARE UNCHANGED ---
// They are safe as they mostly read data or update the UI.

function calculateLevel(xp) {
    const levelThresholds = [0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500];
    let level = 1;
    for (let i = 1; i < levelThresholds.length; i++) {
        if (xp >= levelThresholds[i]) level = i + 1;
        else break;
    }
    return level;
}

function calculateLevelProgress(xp) {
    const levelThresholds = [0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500];
    const level = calculateLevel(xp);
    if (level >= levelThresholds.length) return 100;
    const currentLevelXp = levelThresholds[level - 1];
    const nextLevelXp = levelThresholds[level];
    const xpInCurrentLevel = xp - currentLevelXp;
    const xpRequiredForNextLevel = nextLevelXp - currentLevelXp;
    return Math.min(100, Math.floor((xpInCurrentLevel / xpRequiredForNextLevel) * 100));
}

function getLevelInfo(level) {
    const levelThresholds = [0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500];
    const actualLevel = Math.min(level, levelThresholds.length);
    const currentLevelXp = levelThresholds[actualLevel - 1];
    let nextLevelXp = (actualLevel < levelThresholds.length) ? levelThresholds[actualLevel] : null;
    return { currentLevelXp, nextLevelXp };
}

async function toggleBookmark(questionId) {
    if (!auth || !auth.currentUser || !updateUserProfileFunction) {
        console.log("User not authenticated or function not available for bookmarking.");
        return false;
    }
    const currentSlide = document.querySelector(`.swiper-slide[data-id="${questionId}"]`);
    const isCurrentlyBookmarked = currentSlide ? currentSlide.dataset.bookmarked === "true" : false;
    const newBookmarkState = !isCurrentlyBookmarked;
    if (currentSlide) currentSlide.dataset.bookmarked = newBookmarkState ? "true" : "false";
    if (typeof window.updateBookmarkIcon === 'function') window.updateBookmarkIcon();
    try {
        const uid = auth.currentUser.uid;
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) throw new Error("User document not found.");
        let bookmarks = userDoc.data().bookmarks || [];
        const index = bookmarks.indexOf(questionId);
        if (newBookmarkState) {
            if (index === -1) bookmarks.push(questionId);
        } else {
            if (index > -1) bookmarks.splice(index, 1);
        }
        await updateUserProfileFunction({ bookmarks: bookmarks });
        console.log(`Bookmark toggled for ${questionId} via Cloud Function.`);
        return newBookmarkState;
    } catch (error) {
        console.error("Error toggling bookmark:", error);
        if (currentSlide) currentSlide.dataset.bookmarked = isCurrentlyBookmarked ? "true" : "false";
        if (typeof window.updateBookmarkIcon === 'function') window.updateBookmarkIcon();
        return isCurrentlyBookmarked;
    }
}

async function saveOnboardingSelections(specialty, experienceLevel) {
    if (!auth || !auth.currentUser || !updateUserProfileFunction) {
        throw new Error("User not authenticated or profile update service is unavailable.");
    }
    const dataToSave = {
        specialty: specialty,
        experienceLevel: experienceLevel,
    };
    try {
        await updateUserProfileFunction(dataToSave);
        console.log("Onboarding selections saved via Cloud Function.");
    } catch (error) {
        console.error("Error saving onboarding selections via Cloud Function:", error);
        throw error;
    }
}

async function updateUserXP() {
  if (!auth || !auth.currentUser || !db) {
    return;
  }
  try {
    const uid = auth.currentUser.uid;
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      const totalXP = data.stats?.xp || 0;
      const currentLevel = data.stats?.level || 1;
      const progressPercent = calculateLevelProgress(totalXP);
      const scoreCircle = document.getElementById("scoreCircle");
      if (scoreCircle) scoreCircle.textContent = currentLevel;
      const xpDisplay = document.getElementById("xpDisplay");
      if (xpDisplay) xpDisplay.textContent = `${totalXP} XP`;
      const mainToolbarLevelCircleProgress = document.getElementById("levelCircleProgress");
      if (mainToolbarLevelCircleProgress) {
        mainToolbarLevelCircleProgress.style.setProperty('--progress', `${progressPercent}%`);
      }
      const userScoreCircle = document.getElementById("userScoreCircle");
      if (userScoreCircle) userScoreCircle.textContent = currentLevel;
      const userXpDisplay = document.getElementById("userXpDisplay");
      if (userXpDisplay) {
        const levelInfo = getLevelInfo(currentLevel);
        if (levelInfo.nextLevelXp) {
          userXpDisplay.textContent = `${totalXP}/${levelInfo.nextLevelXp} XP`;
        } else {
          userXpDisplay.textContent = `${totalXP} XP`;
        }
      }
      const userLevelProgress = document.getElementById("userLevelProgress");
      if (userLevelProgress) userLevelProgress.style.setProperty('--progress', `${progressPercent}%`);
      const levelProgressBar = document.getElementById("levelProgressBar");
      if (levelProgressBar) levelProgressBar.style.width = `${progressPercent}%`;
      if (typeof window.initializeDashboard === 'function') {
        window.initializeDashboard();
      }
    }
  } catch (error) {
    console.error("Error updating user XP:", error);
  }
}

async function updateUserMenu() {
  if (!auth || !auth.currentUser) {
    return;
  }
  try {
    const subscribeMenuItem = document.getElementById("subscribeMenuItemUser");
    const manageSubscriptionMenuItem = document.getElementById("manageSubscriptionBtn");
    const logoutUserBtnItem = document.getElementById("logoutUserBtn");
    const guestLoginMenuItem = document.getElementById("guestLoginMenuItem");
    if (subscribeMenuItem && manageSubscriptionMenuItem && logoutUserBtnItem && guestLoginMenuItem) {
        const accessTier = window.authState?.accessTier;
        const isAnonymousUser = window.authState?.user?.isAnonymous;
        subscribeMenuItem.style.display = "none";
        manageSubscriptionMenuItem.style.display = "none";
        logoutUserBtnItem.style.display = "none";
        guestLoginMenuItem.style.display = "none";
        if (isAnonymousUser) {
            subscribeMenuItem.style.display = "block";
            guestLoginMenuItem.style.display = "block";
        } else {
            logoutUserBtnItem.style.display = "block";
            if (accessTier === "free_guest") {
                subscribeMenuItem.style.display = "block";
            } else if (accessTier && accessTier !== "free_guest") {
                manageSubscriptionMenuItem.style.display = "block";
            }
        }
        const newSubscribeMenuItem = subscribeMenuItem.cloneNode(true);
        subscribeMenuItem.parentNode.replaceChild(newSubscribeMenuItem, subscribeMenuItem);
        newSubscribeMenuItem.addEventListener("click", function(e) {
            e.preventDefault();
            if (typeof closeUserMenu === 'function') closeUserMenu();
            if (typeof ensureAllScreensHidden === 'function') ensureAllScreensHidden();
            const mainPaywallScreen = document.getElementById("newPaywallScreen");
            if (mainPaywallScreen) mainPaywallScreen.style.display = "flex";
        });
        const newGuestLoginMenuItem = guestLoginMenuItem.cloneNode(true);
        guestLoginMenuItem.parentNode.replaceChild(newGuestLoginMenuItem, guestLoginMenuItem);
        newGuestLoginMenuItem.addEventListener("click", function(e) {
            e.preventDefault();
            if (typeof closeUserMenu === 'function') closeUserMenu();
            if (typeof window.showLoginForm === 'function') {
                window.showLoginForm();
            }
        });
    }
  } catch (error) {
    console.error("Error updating user menu (user.js):", error);
  }
}

function showLevelUpAnimation(newLevel, totalXP) {
  let modal = document.getElementById('levelUpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'levelUpModal';
    modal.innerHTML = `<div id="levelUpContent"><div id="levelUpHeader"><h2 id="levelUpTitle">LEVEL UP!</h2></div><div id="levelUpBadge"><span id="levelNumber"></span></div><div id="levelUpBody"><p id="levelUpMessage"></p><p id="levelUpXP"></p><button id="levelUpButton">Continue</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('levelUpButton').addEventListener('click', hideLevelUpModal);
  }
  const levelNumber = document.getElementById('levelNumber');
  const levelUpXP = document.getElementById('levelUpXP');
  const levelUpMessage = document.getElementById('levelUpMessage');
  if (levelNumber) levelNumber.textContent = newLevel;
  if (levelUpXP) levelUpXP.textContent = `Total XP: ${totalXP}`;
  if (levelUpMessage) {
    if (newLevel >= 10) levelUpMessage.textContent = "Amazing progress! You've reached an elite level!";
    else if (newLevel >= 5) levelUpMessage.textContent = "Great job! You're becoming a master!";
    else levelUpMessage.textContent = "Congratulations! Keep up the good work!";
  }
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; }, 10);
  }
}

function hideLevelUpModal() {
  const modal = document.getElementById('levelUpModal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
  }
}

// --- Make sure to export all necessary functions ---
export {
  recordAnswer,
  calculateLevel,
  calculateLevelProgress,
  getLevelInfo,
  updateUserXP,
  updateUserMenu,
  toggleBookmark,
  showLevelUpAnimation,
  hideLevelUpModal,
  recordCmeAnswer,
  saveOnboardingSelections,
  updateSpacedRepetitionData,
  fetchSpacedRepetitionData
};