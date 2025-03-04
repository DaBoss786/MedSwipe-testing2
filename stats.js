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
