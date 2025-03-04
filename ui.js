// Show leaderboard view
function showLeaderboard() {
  document.querySelector(".swiper").style.display = "none";
  document.getElementById("bottomToolbar").style.display = "none";
  document.getElementById("iconBar").style.display = "none";
  document.getElementById("performanceView").style.display = "none";
  document.getElementById("mainOptions").style.display = "none";
  document.getElementById("aboutView").style.display = "none";
  document.getElementById("faqView").style.display = "none";
  document.getElementById("leaderboardView").style.display = "block";
  
  // Use the loadOverallData function from stats.js if it exists
  if (typeof loadOverallData === 'function') {
    loadOverallData();
  } else {
    // Fallback message if function is not available
    document.getElementById("leaderboardView").innerHTML = `
      <h2>Leaderboard</h2>
      <p>Leaderboards are loading... Please wait.</p>
      <button class="leaderboard-back-btn" id="leaderboardBack">Back</button>
    `;
    document.getElementById("leaderboardBack").addEventListener("click", function(){
      document.getElementById("leaderboardView").style.display = "none";
      document.getElementById("mainOptions").style.display = "flex";
    });
    
    // Try again after a delay (in case functions are still loading)
    setTimeout(() => {
      if (typeof loadOverallData === 'function') {
        loadOverallData();
      }
    }, 1000);
  }
}

// Show About us view
function showAbout() {
  document.querySelector(".swiper").style.display = "none";
  document.getElementById("bottomToolbar").style.display = "none";
  document.getElementById("iconBar").style.display = "none";
  document.getElementById("performanceView").style.display = "none";
  document.getElementById("leaderboardView").style.display = "none";
  document.getElementById("mainOptions").style.display = "none";
  document.getElementById("faqView").style.display = "none";
  
  document.getElementById("aboutView").innerHTML = `
    <h2>About MedSwipe</h2>
    <p>MedSwipe is a dynamic, swipe-based quiz app designed specifically for medical professionals and learners. Our goal is to improve medical education by offering a casual, engaging alternative to the traditional, regimented board review resources and question banks.</p>
    <p>Created by a board-certified ENT, MedSwipe brings a fresh, interactive approach to studying medicine. Instead of slogging through lengthy textbooks and overly structured review materials, MedSwipe lets you learn on the go—one swipe at a time. The app is designed to keep you engaged with bite‑sized questions, real‑time performance tracking, and interactive leaderboards that make board review feel less like a chore and more like a game.</p>
    <p>Whether you're a seasoned practitioner or just starting out in medicine, MedSwipe is here to support your learning journey in a way that fits seamlessly into your busy lifestyle.</p>
    <button id="aboutBack" class="start-quiz-btn">Back</button>
  `;
  document.getElementById("aboutView").style.display = "block";
  document.getElementById("aboutBack").addEventListener("click", function() {
      document.getElementById("aboutView").style.display = "none";
      document.getElementById("mainOptions").style.display = "flex";
  });
}

// Show FAQ view - UPDATED for XP system
function showFAQ() {
  document.querySelector(".swiper").style.display = "none";
  document.getElementById("bottomToolbar").style.display = "none";
  document.getElementById("iconBar").style.display = "none";
  document.getElementById("performanceView").style.display = "none";
  document.getElementById("leaderboardView").style.display = "none";
  document.getElementById("aboutView").style.display = "none";
  document.getElementById("mainOptions").style.display = "none";
  
  document.getElementById("faqView").innerHTML = `
    <h2>FAQ</h2>
    <ul>
      <li>
        <strong>What is MedSwipe?</strong><br>
        MedSwipe is a dynamic, swipe‑based quiz app designed for ENT professionals and learners. It offers a more casual, engaging alternative to traditional, regimented board review resources.
      </li>
      <li>
        <strong>How Does MedSwipe Work?</strong><br>
        MedSwipe presents ENT questions in an intuitive, swipe‑based format. As you answer, you'll earn XP (experience points) to level up and compete with others on the leaderboard.
      </li>
      <li>
        <strong>How Does the XP System Work?</strong><br>
        You earn XP for every question you answer:<br>
        • 1 XP for answering a question<br>
        • 2 additional XP for a correct answer<br>
        • Bonus multipliers for maintaining streaks (3+ days: 1.5× multiplier, 7+ days: 2× multiplier)<br><br>
        
        As you accumulate XP, you'll progress through levels. Each level requires more XP than the previous one, creating an ongoing challenge.
      </li>
      <li>
        <strong>What Are Streaks?</strong><br>
        Streaks track consecutive days of app usage. Using the app at least once per day maintains your streak. Longer streaks earn you XP multipliers, making your studying more rewarding when you're consistent.
      </li>
      <li>
        <strong>How Do Leaderboards Work?</strong><br>
        There are three leaderboards to compete on:<br>
        • XP Rankings: Overall progress based on total experience points<br>
        • Streaks: Longest consecutive days of app usage<br>
        • Weekly Activity: Most questions answered in the current week
      </li>
      <li>
        <strong>Is MedSwipe Free?</strong><br>
        For now, MedSwipe is completely free. Our aim is to build an engaged community before we roll out any premium features.
      </li>
      <li>
        <strong>How Do I Provide Feedback?</strong><br>
        Use the in‑app feedback button to let us know what you think or if you encounter any issues. Your input is crucial for our continued improvement.
      </li>
    </ul>
    <button id="faqBack" class="start-quiz-btn">Back</button>
  `;
  document.getElementById("faqView").style.display = "block";
  document.getElementById("faqBack").addEventListener("click", function() {
      document.getElementById("faqView").style.display = "none";
      document.getElementById("mainOptions").style.display = "flex";
  });
}

// Show Contact modal
function showContactModal() {
  document.getElementById("contactModal").style.display = "flex";
}
