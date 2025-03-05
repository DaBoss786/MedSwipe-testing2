// Make functions globally available
window.displayPerformance = displayPerformance;
window.loadOverallData = loadOverallData;
window.loadStreaksData = loadStreaksData;
window.loadTotalAnsweredData = loadTotalAnsweredData;

// Display performance stats with both accuracy chart and XP display
async function displayPerformance() {
  console.log("displayPerformance function called");
  document.querySelector(".swiper").style.display = "none";
  document.getElementById("bottomToolbar").style.display = "none";
  document.getElementById("iconBar").style.display = "none";
  document.getElementById("mainOptions").style.display = "none";
  document.getElementById("leaderboardView").style.display = "none";
  document.getElementById("aboutView").style.display = "none";
  document.getElementById("faqView").style.display = "none";
  document.getElementById("performanceView").style.display = "block";
  
  const uid = window.auth.currentUser.uid;
  const userDocRef = window.doc(window.db, 'users', uid);
  const userDocSnap = await window.getDoc(userDocRef);
  console.log("User document exists:", userDocSnap.exists());
  
  if (!userDocSnap.exists()) {
    document.getElementById("performanceView").innerHTML = `
      <h2>Performance</h2>
      <p>No performance data available yet.</p>
      <button id='backToMain'>Back</button>
    `;
    document.getElementById("backToMain").addEventListener("click", () => {
      document.getElementById("performanceView").style.display = "none";
      document.getElementById("mainOptions").style.display = "flex";
    });
    return;
  }
  const data = userDocSnap.data();
  const stats = data.stats || {};
  
  const totalAnswered = stats.totalAnswered || 0;
  const xp = stats.xp || 0;
  const level = stats.level || 1;
  
  let questionBank = [];
  try {
    questionBank = await fetchQuestionBank();
  } catch (error) {
    console.error("Error fetching question bank:", error);
  }
  const totalInBank = questionBank.length;
  console.log("Total in bank: ", totalInBank, "Total answered: ", totalAnswered);
  
  let remaining = totalInBank - totalAnswered;
  if (remaining < 0) { remaining = 0; }
  
  const totalCorrect = stats.totalCorrect || 0;
  const overallPercent = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  
  // Get level progress info
  const levelThresholds = [0, 30, 75, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2750, 3750, 5000, 6500];
  const currentLevelXp = levelThresholds[level - 1] || 0;
  const nextLevelXp = level < levelThresholds.length ? levelThresholds[level] : null;
  
  const xpInCurrentLevel = xp - currentLevelXp;
  const xpRequiredForNextLevel = nextLevelXp ? nextLevelXp - currentLevelXp : 1000; // Default to 1000 if at max level
  const levelProgress = Math.min(100, Math.floor((xpInCurrentLevel / xpRequiredForNextLevel) * 100));
  
  let categoryBreakdown = "";
  if (stats.categories) {
    categoryBreakdown = Object.keys(stats.categories).map(cat => {
      const c = stats.categories[cat];
      const answered = c.answered;
      const correct = c.correct;
      const percent = answered > 0 ? Math.round((correct / answered) * 100) : 0;
      return `
        <div class="category-item">
          <strong>${cat}</strong>: ${correct}/${answered} (${percent}%)
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${percent}%"></div>
          </div>
        </div>
      `;
    }).join("");
  } else {
    categoryBreakdown = "<p>No category data available.</p>";
  }
  
  document.getElementById("performanceView").innerHTML = `
    <h2 style="text-align:center; color:#0056b3;">Performance</h2>
    
    <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:20px; margin-bottom:20px;">
      <!-- Accuracy Doughnut Chart -->
      <div style="flex:1; min-width:220px; max-width:300px; display:flex; flex-direction:column; align-items:center;">
        <canvas id="overallScoreChart" width="200" height="200"></canvas>
        <p style="font-size:1.2rem; color:#333; margin-top:10px; text-align:center;">
          Accuracy: ${overallPercent}%
        </p>
      </div>
      
      <!-- XP Level Display -->
      <div style="flex:1; min-width:220px; max-width:300px; display:flex; flex-direction:column; align-items:center;">
        <div class="level-progress-circle" style="width:100px; height:100px; margin:20px auto;">
          <div class="level-circle-background"></div>
          <div class="level-circle-progress" id="performanceLevelProgress"></div>
          <div class="level-number" style="font-size:2rem; transform:scale(0.85);">${level}</div>
        </div>
        <p style="font-size:1.4rem; color:#0056b3; margin:10px 0 5px 0; text-align:center;">
          ${xp} XP
        </p>
        <p style="font-size:0.9rem; color:#666; margin-top:0; text-align:center;">
          ${nextLevelXp ? `${xpInCurrentLevel}/${xpRequiredForNextLevel} XP to Level ${level + 1}` : 'Max Level Reached!'}
        </p>
      </div>
    </div>
    
    <div style="background:#f5f5f5; border-radius:8px; padding:15px; margin:20px 0;">
      <h3 style="margin-top:0; color:#0056b3; text-align:center;">Stats Summary</h3>
      <p style="font-size:1rem; color:#333;">
        Total Questions Answered: <strong>${totalAnswered}</strong>
      </p>
      <p style="font-size:1rem; color:#333;">
        Correct Answers: <strong>${totalCorrect}</strong> (${overallPercent}%)
      </p>
      <p style="font-size:1rem; color:#333;">
        Questions Remaining: <strong>${remaining}</strong>
      </p>
    </div>
    
    <hr>
    <h3 style="text-align:center; color:#0056b3;">By Category</h3>
    ${categoryBreakdown}
    <button id="backToMain" style="margin-top:20px;">Back</button>
  `;
  
  // Draw accuracy doughnut chart
  const ctx = document.getElementById("overallScoreChart").getContext("2d");
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Correct", "Incorrect"],
      datasets: [{
        data: [
          totalCorrect,
          totalAnswered - totalCorrect
        ],
        backgroundColor: ["#28a745", "#dc3545"]
      }]
    },
    options: {
      responsive: false,
      cutout: "60%",
      plugins: {
        legend: {
          display: true
        }
      }
    }
  });
  
  // Set the level progress circle fill
  const performanceLevelProgress = document.getElementById("performanceLevelProgress");
  if (performanceLevelProgress) {
    performanceLevelProgress.style.setProperty('--progress', `${levelProgress}%`);
  }
  
  document.getElementById("backToMain").addEventListener("click", function() {
    document.getElementById("performanceView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
  });
}

// Load XP Rankings leaderboard with modern card-based design (XP only, no level badge)
async function loadOverallData() {
  console.log("Loading XP rankings leaderboard data");
  const currentUid = window.auth.currentUser.uid;
  const currentUsername = await getOrGenerateUsername();
  const querySnapshot = await window.getDocs(window.collection(window.db, 'users'));
  let leaderboardEntries = [];
  
  querySnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.stats) {
      const xp = data.stats.xp || 0;
      const level = data.stats.level || 1;
      leaderboardEntries.push({
        uid: docSnap.id,
        username: data.username || "Anonymous",
        xp: xp,
        level: level
      });
    }
  });
  
  // Sort by XP (descending)
  leaderboardEntries.sort((a, b) => b.xp - a.xp);
  
  // Get top performers and assign ranks
  let top10 = leaderboardEntries.slice(0, 10);
  
  // Find current user's entry
  let currentUserEntry = leaderboardEntries.find(e => e.uid === currentUid);
  let currentUserRank = leaderboardEntries.findIndex(e => e.uid === currentUid) + 1;
  
  // Generate HTML with card-based layout
  let html = `
    <h2>Leaderboard - XP Rankings</h2>
    
    <div id="leaderboardTabs">
      <button class="leaderboard-tab active" id="overallTab">XP Rankings</button>
      <button class="leaderboard-tab" id="streaksTab">Streaks</button>
      <button class="leaderboard-tab" id="answeredTab">Total Answered</button>
    </div>
    
    <ul class="leaderboard-entry-list">
  `;
  
  if (top10.length === 0) {
    html += `<div class="empty-state">No leaderboard data available yet. Start answering questions to be the first on the leaderboard!</div>`;
  } else {
    top10.forEach((entry, index) => {
      const isCurrentUser = entry.uid === currentUid;
      const rank = index + 1;
      
      html += `
        <li class="leaderboard-entry ${isCurrentUser ? 'current-user' : ''}">
          <div class="rank-container rank-${rank}">${rank}</div>
          <div class="user-info">
            <p class="username">${entry.username}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${entry.xp}</p>
            <p class="stat-label">XP</p>
          </div>
        </li>
      `;
    });
  }
  
  html += `</ul>`;
  
  // Add current user's ranking if not in top 10
  if (currentUserEntry && !top10.some(e => e.uid === currentUid)) {
    html += `
      <div class="your-ranking">
        <h3>Your Ranking</h3>
        <div class="leaderboard-entry current-user">
          <div class="rank-container">${currentUserRank}</div>
          <div class="user-info">
            <p class="username">${currentUsername}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${currentUserEntry.xp}</p>
            <p class="stat-label">XP</p>
          </div>
        </div>
      </div>
    `;
  }
  
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  
  document.getElementById("leaderboardView").innerHTML = html;
  
  // Add event listeners for tabs and back button
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
    document.getElementById("aboutView").style.display = "none";
  });
}

// Load Streaks leaderboard with modern card-based design
async function loadStreaksData() {
  const currentUid = window.auth.currentUser.uid;
  const currentUsername = await getOrGenerateUsername();
  const querySnapshot = await window.getDocs(window.collection(window.db, 'users'));
  let streakEntries = [];
  
  querySnapshot.forEach(docSnap => {
    const data = docSnap.data();
    let streak = data.streaks ? (data.streaks.currentStreak || 0) : 0;
    if (streak > 0) {
      streakEntries.push({
        uid: docSnap.id,
        username: data.username || "Anonymous",
        streak: streak
      });
    }
  });
  
  // Sort by streak length (descending)
  streakEntries.sort((a, b) => b.streak - a.streak);
  
  // Get top performers
  let top10 = streakEntries.slice(0, 10);
  
  // Find current user's entry
  let currentUserEntry = streakEntries.find(e => e.uid === currentUid);
  let currentUserRank = streakEntries.findIndex(e => e.uid === currentUid) + 1;
  
  // Generate HTML with card-based layout
  let html = `
    <h2>Leaderboard - Streaks</h2>
    
    <div id="leaderboardTabs">
      <button class="leaderboard-tab" id="overallTab">XP Rankings</button>
      <button class="leaderboard-tab active" id="streaksTab">Streaks</button>
      <button class="leaderboard-tab" id="answeredTab">Total Answered</button>
    </div>
    
    <ul class="leaderboard-entry-list">
  `;
  
  if (top10.length === 0) {
    html += `<div class="empty-state">No streak data available yet. Use the app daily to build your streak!</div>`;
  } else {
    top10.forEach((entry, index) => {
      const isCurrentUser = entry.uid === currentUid;
      const rank = index + 1;
      
      html += `
        <li class="leaderboard-entry ${isCurrentUser ? 'current-user' : ''}">
          <div class="rank-container rank-${rank}">${rank}</div>
          <div class="user-info">
            <p class="username">${entry.username}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${entry.streak}</p>
            <p class="stat-label">DAYS</p>
          </div>
        </li>
      `;
    });
  }
  
  html += `</ul>`;
  
  // Add current user's ranking if not in top 10
  if (currentUserEntry && !top10.some(e => e.uid === currentUid)) {
    html += `
      <div class="your-ranking">
        <h3>Your Ranking</h3>
        <div class="leaderboard-entry current-user">
          <div class="rank-container">${currentUserRank}</div>
          <div class="user-info">
            <p class="username">${currentUsername}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${currentUserEntry.streak}</p>
            <p class="stat-label">DAYS</p>
          </div>
        </div>
      </div>
    `;
  }
  
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  
  document.getElementById("leaderboardView").innerHTML = html;
  
  // Add event listeners for tabs and back button
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
    document.getElementById("aboutView").style.display = "none";
  });
}

// Load Total Answered leaderboard with modern card-based design
async function loadTotalAnsweredData() {
  const currentUid = window.auth.currentUser.uid;
  const currentUsername = await getOrGenerateUsername();
  const weekStart = getStartOfWeek();
  const querySnapshot = await window.getDocs(window.collection(window.db, 'users'));
  let answeredEntries = [];
  
  querySnapshot.forEach(docSnap => {
    const data = docSnap.data();
    let weeklyCount = 0;
    if (data.answeredQuestions) {
      for (const key in data.answeredQuestions) {
        const answer = data.answeredQuestions[key];
        if (answer.timestamp && answer.timestamp >= weekStart) {
          weeklyCount++;
        }
      }
    }
    if (weeklyCount > 0) {
      answeredEntries.push({
        uid: docSnap.id,
        username: data.username || "Anonymous",
        weeklyCount: weeklyCount
      });
    }
  });
  
  // Sort by weekly count (descending)
  answeredEntries.sort((a, b) => b.weeklyCount - a.weeklyCount);
  
  // Get top performers
  let top10 = answeredEntries.slice(0, 10);
  
  // Find current user's entry
  let currentUserEntry = answeredEntries.find(e => e.uid === currentUid);
  let currentUserRank = answeredEntries.findIndex(e => e.uid === currentUid) + 1;
  
  // Generate HTML with card-based layout
  let html = `
    <h2>Leaderboard - Total Answered Questions This Week</h2>
    
    <div id="leaderboardTabs">
      <button class="leaderboard-tab" id="overallTab">XP Rankings</button>
      <button class="leaderboard-tab" id="streaksTab">Streaks</button>
      <button class="leaderboard-tab active" id="answeredTab">Total Answered</button>
    </div>
    
    <ul class="leaderboard-entry-list">
  `;
  
  if (top10.length === 0) {
    html += `<div class="empty-state">No questions answered this week yet. Start answering questions to appear on the leaderboard!</div>`;
  } else {
    top10.forEach((entry, index) => {
      const isCurrentUser = entry.uid === currentUid;
      const rank = index + 1;
      
      html += `
        <li class="leaderboard-entry ${isCurrentUser ? 'current-user' : ''}">
          <div class="rank-container rank-${rank}">${rank}</div>
          <div class="user-info">
            <p class="username">${entry.username}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${entry.weeklyCount}</p>
            <p class="stat-label">QUESTIONS</p>
          </div>
        </li>
      `;
    });
  }
  
  html += `</ul>`;
  
  // Add current user's ranking if not in top 10
  if (currentUserEntry && !top10.some(e => e.uid === currentUid)) {
    html += `
      <div class="your-ranking">
        <h3>Your Ranking</h3>
        <div class="leaderboard-entry current-user">
          <div class="rank-container">${currentUserRank}</div>
          <div class="user-info">
            <p class="username">${currentUsername}</p>
          </div>
          <div class="user-stats">
            <p class="stat-value">${currentUserEntry.weeklyCount}</p>
            <p class="stat-label">QUESTIONS</p>
          </div>
        </div>
      </div>
    `;
  }
  
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  
  document.getElementById("leaderboardView").innerHTML = html;
  
  // Add event listeners for tabs and back button
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
    document.getElementById("leaderboardView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
    document.getElementById("aboutView").style.display = "none";
  });
}
