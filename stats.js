// Display performance stats
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
    
    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:10px;">
      <div class="level-progress-circle" style="width:100px; height:100px; margin:20px auto;">
        <div class="level-circle-background"></div>
        <div class="level-circle-progress" style="--progress: ${levelProgress}%"></div>
        <div class="level-number" style="font-size:2rem; transform:scale(0.85);">${level}</div>
      </div>
      <p style="font-size:1.4rem; color:#0056b3; margin:10px 0 5px 0;">
        ${xp} XP
      </p>
      <p style="font-size:0.9rem; color:#666; margin-top:0;">
        ${nextLevelXp ? `${xpInCurrentLevel}/${xpRequiredForNextLevel} XP to Level ${level + 1}` : 'Max Level Reached!'}
      </p>
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
  
  // Set the level progress circle fill
  const levelCircleProgress = document.querySelector("#performanceView .level-circle-progress");
  if (levelCircleProgress) {
    levelCircleProgress.style.setProperty('--progress', `${levelProgress}%`);
  }
  
  document.getElementById("backToMain").addEventListener("click", function() {
    document.getElementById("performanceView").style.display = "none";
    document.getElementById("mainOptions").style.display = "flex";
  });
}

// Load leaderboard data for XP rankings
async function loadOverallData() {
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
  leaderboardEntries.sort((a, b) => b.xp - a.xp);
  let top10 = leaderboardEntries.slice(0,10);
  let currentUserEntry = leaderboardEntries.find(e => e.uid === currentUid);
  
  let html = `<h2>Leaderboard - XP Rankings</h2>`;
  html += leaderboardTabsHTML("overall");
  html += `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Level</th>
          <th>XP</th>
        </tr>
      </thead>
      <tbody>
  `;
  top10.forEach((entry, index) => {
    const bold = entry.uid === currentUid ? "style='font-weight:bold;'" : "";
    html += `
      <tr ${bold}>
        <td>${index + 1}</td>
        <td>${entry.username}</td>
        <td>${entry.level}</td>
        <td>${entry.xp}</td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  
  if (!top10.some(e => e.uid === currentUid) && currentUserEntry) {
    html += `
      <h3>Your Ranking</h3>
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Level</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          <tr style="font-weight:bold;">
            <td>${currentUsername}</td>
            <td>${currentUserEntry.level}</td>
            <td>${currentUserEntry.xp}</td>
          </tr>
        </tbody>
      </table>
    `;
  }
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  document.getElementById("leaderboardView").innerHTML = html;
  
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
     document.getElementById("leaderboardView").style.display = "none";
     document.getElementById("mainOptions").style.display = "flex";
     document.getElementById("aboutView").style.display = "none";
  });
}

// Load leaderboard data for streaks
async function loadStreaksData() {
  const currentUid = window.auth.currentUser.uid;
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
  streakEntries.sort((a, b) => b.streak - a.streak);
  let html = `<h2>Leaderboard - Streaks</h2>`;
  html += leaderboardTabsHTML("streaks");
  html += `
     <table class="leaderboard-table">
       <thead>
         <tr>
           <th>Rank</th>
           <th>Name</th>
           <th>Streak (days)</th>
         </tr>
       </thead>
       <tbody>
  `;
  streakEntries.forEach((entry, index) => {
    const bold = entry.uid === currentUid ? "style='font-weight:bold;'" : "";
    html += `
       <tr ${bold}>
         <td>${index + 1}</td>
         <td>${entry.username}</td>
         <td>${entry.streak}</td>
       </tr>
    `;
  });
  html += `</tbody></table>`;
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  document.getElementById("leaderboardView").innerHTML = html;
  
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
     document.getElementById("leaderboardView").style.display = "none";
     document.getElementById("mainOptions").style.display = "flex";
     document.getElementById("aboutView").style.display = "none";
  });
}

// Load leaderboard data for total answered questions
async function loadTotalAnsweredData() {
  const currentUid = window.auth.currentUser.uid;
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
  answeredEntries.sort((a, b) => b.weeklyCount - a.weeklyCount);
  let html = `<h2>Leaderboard - Total Answered This Week</h2>`;
  html += leaderboardTabsHTML("answered");
  html += `
     <table class="leaderboard-table">
       <thead>
         <tr>
           <th>Rank</th>
           <th>Name</th>
           <th>Total Answered</th>
         </tr>
       </thead>
       <tbody>
  `;
  answeredEntries.forEach((entry, index) => {
    const bold = entry.uid === currentUid ? "style='font-weight:bold;'" : "";
    html += `
       <tr ${bold}>
         <td>${index + 1}</td>
         <td>${entry.username}</td>
         <td>${entry.weeklyCount}</td>
       </tr>
    `;
  });
  html += `</tbody></table>`;
  html += `<button class="leaderboard-back-btn" id="leaderboardBack">Back</button>`;
  document.getElementById("leaderboardView").innerHTML = html;
  
  document.getElementById("overallTab").addEventListener("click", function(){ loadOverallData(); });
  document.getElementById("streaksTab").addEventListener("click", function(){ loadStreaksData(); });
  document.getElementById("answeredTab").addEventListener("click", function(){ loadTotalAnsweredData(); });
  
  document.getElementById("leaderboardBack").addEventListener("click", function(){
     document.getElementById("leaderboardView").style.display = "none";
     document.getElementById("mainOptions").style.display = "flex";
     document.getElementById("aboutView").style.display = "none";
  });
}
