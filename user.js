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

// Record answer in Firestore with streaks logic
async function recordAnswer(questionId, category, isCorrect, timeSpent) {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated, can't record answer");
    return;
  }
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  try {
    await window.runTransaction(window.db, async (transaction) => {
      const userDoc = await window.getDoc(userDocRef);
      let data = userDoc.exists() ? userDoc.data() : {};
      
      if (!data.stats) {
        data.stats = { totalAnswered: 0, totalCorrect: 0, totalIncorrect: 0, categories: {}, totalTimeSpent: 0 };
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
      data.stats.totalAnswered++;
      if (isCorrect) {
        data.stats.totalCorrect++;
      } else {
        data.stats.totalIncorrect++;
      }
      data.stats.totalTimeSpent = (data.stats.totalTimeSpent || 0) + timeSpent;
      
      if (!data.stats.categories[category]) {
        data.stats.categories[category] = { answered: 0, correct: 0, incorrect: 0 };
      }
      data.stats.categories[category].answered++;
      if (isCorrect) {
        data.stats.categories[category].correct++;
      } else {
        data.stats.categories[category].incorrect++;
      }
      
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
      
      transaction.set(userDocRef, data, { merge: true });
    });
    console.log("Recorded answer for", questionId);
    // Update user information after recording answer
    updateUserCompositeScore();
    updateUserMenu();
  } catch (error) {
    console.error("Error recording answer:", error);
  }
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

// Update composite score from Firestore stats
async function updateUserCompositeScore() {
  if (!window.auth || !window.auth.currentUser || !window.db) {
    console.log("Auth or DB not initialized for updateUserCompositeScore");
    return;
  }
  
  try {
    const uid = window.auth.currentUser.uid;
    const userDocRef = window.doc(window.db, 'users', uid);
    const userDocSnap = await window.getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      const totalAnswered = data.stats?.totalAnswered || 0;
      const totalCorrect = data.stats?.totalCorrect || 0;
      const accuracy = totalAnswered ? totalCorrect / totalAnswered : 0;
      const normTotal = Math.min(totalAnswered, 100) / 100;
      const longestStreak = (data.streaks && data.streaks.longestStreak) ? data.streaks.longestStreak : 0;
      const normStreak = Math.min(longestStreak, 30) / 30;
      const composite = Math.round(((accuracy * 0.5) + (normTotal * 0.3) + (normStreak * 0.2)) * 100);
      
      // Update both score circles
      const scoreCircle = document.getElementById("scoreCircle");
      if (scoreCircle) {
        scoreCircle.textContent = composite;
      }
      
      const userScoreCircle = document.getElementById("userScoreCircle");
      if (userScoreCircle) {
        userScoreCircle.textContent = composite;
      }
    }
  } catch (error) {
    console.error("Error updating user composite score:", error);
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
    
    // Also update the composite score
    updateUserCompositeScore();
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

// Bookmark functions
async function getBookmarks() {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated for getBookmarks");
    return [];
  }
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  const userDocSnap = await window.getDoc(userDocRef);
  if(userDocSnap.exists()){
    const data = userDocSnap.data();
    return data.bookmarks || [];
  }
  return [];
}

async function toggleBookmark(questionId) {
  if (!window.auth || !window.auth.currentUser) {
    console.log("User not authenticated for toggleBookmark");
    return false;
  }
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  try {
    await window.runTransaction(window.db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      let data = userDoc.exists() ? userDoc.data() : {};
      let bookmarks = data.bookmarks || [];
      if (!bookmarks.includes(questionId)) {
        bookmarks.push(questionId);
      }
      transaction.set(userDocRef, { bookmarks: bookmarks }, { merge: true });
    });
    const updatedBookmarks = await getBookmarks();
    return updatedBookmarks.includes(questionId);
  } catch (e) {
    console.error("Error toggling bookmark:", e);
    return false;
  }
}
