// Session tracking
let questionStartTime = 0;
let sessionStartTime = Date.now();

// Fetch already answered questions from Firestore
async function fetchPersistentAnsweredIds() {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated yet");
    return [];
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    if (userDocSnap.exists()){
      let data = userDocSnap.data();
      return Object.keys(data.answeredQuestions || {});
    }
  } catch (error) {
    console.error("Error fetching answered IDs:", error);
  }
  return [];
}

// Record answer in Firestore with XP calculation
async function recordAnswer(questionId, category, isCorrect, timeSpent) {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated, can't record answer");
    return;
  }
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  try {
    await window.runTransaction(window.db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      let data = userDoc.exists() ? userDoc.data() : {};
      
      // Initialize stats if needed
      if (!data.stats) {
        data.stats = { 
          totalAnswered: 0, 
          totalCorrect: 0, 
          totalIncorrect: 0, 
          categories: {}, 
          totalTimeSpent: 0,
          xp: 0, // Initialize XP
          level: 1  // Initialize level
        };
      }
      
      // Initialize XP if it doesn't exist
      if (data.stats.xp === undefined) {
        data.stats.xp = 0;
      }
      
      // Initialize level if it doesn't exist
      if (data.stats.level === undefined) {
        data.stats.level = 1;
      }
      
      if (!data.answeredQuestions) {
        data.answeredQuestions = {};
      }
      if (data.answeredQuestions[questionId]) return;
      
      const currentDate = new Date();
      const currentTimestamp = currentDate.getTime();
      const currentFormatted = currentDate.toLocaleString();
      
      data.answeredQuestions[questionId] = { 
        isCorrect, 
        category, 
        timestamp: currentTimestamp, 
        timestampFormatted: currentFormatted, 
        timeSpent 
      };
      
      // Update basic stats
      data.stats.totalAnswered++;
      if (isCorrect) {
        data.stats.totalCorrect++;
      } else {
        data.stats.totalIncorrect++;
      }
      data.stats.totalTimeSpent = (data.stats.totalTimeSpent || 0) + timeSpent;
      
      // Update category stats
      if (!data.stats.categories[category]) {
        data.stats.categories[category] = { answered: 0, correct: 0, incorrect: 0 };
      }
      data.stats.categories[category].answered++;
      if (isCorrect) {
        data.stats.categories[category].correct++;
      } else {
        data.stats.categories[category].incorrect++;
      }
      
      // Update streaks
      const normalizeDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
      let streaks = data.streaks || { lastAnsweredDate: null, currentStreak: 0, longestStreak: 0 };
      if (streaks.lastAnsweredDate) {
        const lastDate = new Date(streaks.lastAnsweredDate);
        const normalizedCurrent = normalizeDate(currentDate);
        const normalizedLast = normalizeDate(lastDate);
        const diffDays = Math.round((normalizedCurrent - normalizedLast) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          streaks.currentStreak += 1;
        } else if (diffDays > 1) {
          streaks.currentStreak = 1;
        }
        streaks.lastAnsweredDate = currentDate.toISOString();
        if (streaks.currentStreak > streaks.longestStreak) {
          streaks.longestStreak = streaks.currentStreak;
        }
      } else {
        streaks.lastAnsweredDate = currentDate.toISOString();
        streaks.currentStreak = 1;
        streaks.longestStreak = 1;
      }
      data.streaks = streaks;
      
      // Calculate XP for this answer
      let earnedXP = 1; // Base XP for answering
      if (isCorrect) {
        earnedXP += 2; // Additional XP for correct answer
      }
      
      // Check for streak bonuses
      if (streaks.currentStreak >= 7) {
        earnedXP *= 2; // Double XP for 7+ day streak
      } else if (streaks.currentStreak >= 3) {
        earnedXP = Math.floor(earnedXP * 1.5); // 50% bonus for 3+ day streak
      }
      
      // Add the earned XP to user's total
      data.stats.xp += earnedXP;
      
      // Update level based on XP
      data.stats.level = calculateLevel(data.stats.xp);
      
      transaction.set(userDocRef, data, { merge: true });
    });
    console.log("Recorded answer for", questionId);
    // Update user information after recording answer
    updateUserXP();
    updateUserMenu();
  } catch (error) {
    console.error("Error recording answer:", error);
  }
}

// Calculate level based on XP thresholds
function calculateLevel(xp) {
  const levelThresholds = [
    0,     // Level 1
    30,    // Level 2
    75,    // Level 3
    150,   // Level 4
    250,   // Level 5
    400,   // Level 6
    600,   // Level 7
    850,   // Level 8
    1150,  // Level 9
    1500,  // Level 10
    2000,  // Level 11
    2750,  // Level 12
    3750,  // Level 13
    5000,  // Level 14
    6500   // Level 15
  ];
  
  let level = 1;
  for (let i = 1; i < levelThresholds.length; i++) {
    if (xp >= levelThresholds[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

// Calculate progress to next level (as percentage)
function calculateLevelProgress(xp) {
  const levelThresholds = [
    0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500
  ];
  
  const level = calculateLevel(xp);
  
  // If at max level, return 100%
  if (level >= levelThresholds.length) {
    return 100;
  }
  
  const currentLevelXp = levelThresholds[level - 1];
  const nextLevelXp = levelThresholds[level];
  const xpInCurrentLevel = xp - currentLevelXp;
  const xpRequiredForNextLevel = nextLevelXp - currentLevelXp;
  
  return Math.min(100, Math.floor((xpInCurrentLevel / xpRequiredForNextLevel) * 100));
}

// XP info for a specific level
function getLevelInfo(level) {
  const levelThresholds = [
    0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500
  ];
  
  // Cap at max defined level
  const actualLevel = Math.min(level, levelThresholds.length);
  
  const currentLevelXp = levelThresholds[actualLevel - 1];
  let nextLevelXp = null;
  
  if (actualLevel < levelThresholds.length) {
    nextLevelXp = levelThresholds[actualLevel];
  }
  
  return {
    currentLevelXp,
    nextLevelXp
  };
}

// Update question stats in Firestore
async function updateQuestionStats(questionId, isCorrect) {
  if (!window.db) {
    console.log("Database not initialized");
    return;
  }
  
  console.log("updateQuestionStats called for:", questionId, "isCorrect:", isCorrect);
  const questionStatsRef = window.doc(window.db, "questionStats", questionId);
  try {
    await window.runTransaction(window.db, async (transaction) => {
      const statsDoc = await transaction.get(questionStatsRef);
      let statsData = statsDoc.exists() ? statsDoc.data() : { totalAttempts: 0, correctAttempts: 0 };
      statsData.totalAttempts++;
      if (isCorrect) {
        statsData.correctAttempts++;
      }
      transaction.set(questionStatsRef, statsData, { merge: true });
    });
    console.log("Updated stats for question", questionId);
  } catch (error) {
    console.error("Error updating question stats:", error);
  }
}

// Update user XP display
async function updateUserXP() {
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for updateUserXP");
    return;
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      const xp = data.stats?.xp || 0;
      const level = data.stats?.level || 1;
      const progress = calculateLevelProgress(xp);
      
      // Update level display
      const scoreCircle = document.getElementById("scoreCircle");
      if (scoreCircle) {
        scoreCircle.textContent = level;
        
        // Set the circle fill percentage based on level progress
        // (This would need CSS adjustments to show as a progress circle)
      }
      
      // Update XP display
      const xpDisplay = document.getElementById("xpDisplay");
      if (xpDisplay) {
        xpDisplay.textContent = `${xp} XP`;
      }
      
      // Update user menu level display
      const userScoreCircle = document.getElementById("userScoreCircle");
      if (userScoreCircle) {
        userScoreCircle.textContent = level;
      }
      
      // Update user menu XP display
      const userXpDisplay = document.getElementById("userXpDisplay");
      if (userXpDisplay) {
        const levelInfo = getLevelInfo(level);
        if (levelInfo.nextLevelXp) {
          userXpDisplay.textContent = `${xp}/${levelInfo.nextLevelXp} XP`;
        } else {
          userXpDisplay.textContent = `${xp} XP`;
        }
      }
      
      // Update level progress bar
      const levelProgressBar = document.getElementById("levelProgressBar");
      if (levelProgressBar) {
        levelProgressBar.style.width = `${progress}%`;
      }
    }
  } catch (error) {
    console.error("Error updating user XP:", error);
  }
}

// Update the user menu with current username and score
async function updateUserMenu() {
  if (!window.auth || !window.auth.currentUser) {
    console.log("Auth not initialized for updateUserMenu");
    return;
  }
  
  try {
    const username = await getOrGenerateUsername();
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (usernameDisplay) {
      usernameDisplay.textContent = username;
    }
    
    // Update XP display
    updateUserXP();
  } catch (error) {
    console.error("Error updating user menu:", error);
  }
}

// Get or generate a username
async function getOrGenerateUsername() {
  if (!window.auth || !window.auth.currentUser) {
    throw new Error("User not authenticated");
  }
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  const userDocSnap = await window.getDoc(userDocRef);
  let username;
  if (userDocSnap.exists() && userDocSnap.data().username) {
    username = userDocSnap.data().username;
  } else {
    username = generateRandomName();
    await window.runTransaction(window.db, async (transaction) => {
      const docSnap = await transaction.get(userDocRef);
      let data = docSnap.exists() ? docSnap.data() : {};
      data.username = username;
      transaction.set(userDocRef, data, { merge: true });
    });
  }
  return username;
}

// Generate a random username
function generateRandomName() {
  const adjectives = ["Aural", "Otologic", "Laryngic", "Rhinal", "Acoustic", "Vocal"];
  const nouns = ["Cochlea", "Tympanum", "Glottis", "Sinus", "Auricle", "Eustachian"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}${noun}${num}`;
}

// Bookmark functions - enhanced for toggling
async function getBookmarks() {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated for getBookmarks");
    return [];
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    if(userDocSnap.exists()){
      const data = userDocSnap.data();
      return data.bookmarks || [];
    }
  } catch (error) {
    console.error("Error getting bookmarks:", error);
  }
  return [];
}

// Toggle a bookmark (add if not present, remove if present)
async function toggleBookmark(questionId) {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated for toggleBookmark");
    return false;
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    
    await window.runTransaction(window.db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      let data = userDoc.exists() ? userDoc.data() : {};
      let bookmarks = data.bookmarks || [];
      
      // Check if the question is already bookmarked
      const index = bookmarks.indexOf(questionId);
      
      // If not bookmarked, add it
      if (index === -1) {
        bookmarks.push(questionId);
      } 
      // If already bookmarked, remove it (true toggle functionality)
      else {
        bookmarks.splice(index, 1);
      }
      
      transaction.set(userDocRef, { bookmarks: bookmarks }, { merge: true });
    });
    
    // Get the updated bookmarks list
    const updatedBookmarks = await getBookmarks();
    const isBookmarked = updatedBookmarks.includes(questionId);
    
    // Update the current slide's bookmark attribute
    const currentSlide = document.querySelector(`.swiper-slide[data-id="${questionId}"]`);
    if (currentSlide) {
      currentSlide.dataset.bookmarked = isBookmarked ? "true" : "false";
    }
    
    return isBookmarked;
  } catch (error) {
    console.error("Error toggling bookmark:", error);
    return false;
  }
}
