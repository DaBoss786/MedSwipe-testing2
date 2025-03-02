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
  loadOverallData();
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

// Show FAQ view - UPDATED with new composite score explanation
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
        MedSwipe presents ENT questions in an intuitive, swipe‑based format. As you answer, your performance is tracked using a composite score that factors in:
        <ul>
          <li>Accuracy: The percentage of correct answers.</li>
          <li>Total Answered: Your overall volume of answered questions (normalized at a cap of 250 questions).</li>
          <li>Longest Streak: Your longest run of consecutive days answering questions.</li>
        </ul>
        This approach rewards both knowledge and sustained engagement.
      </li>
      <li>
        <strong>What Is the Composite Score?</strong><br>
        Your Composite Score is calculated using a weighted formula:<br>
        <em>Composite Score = (Accuracy × 0.5) + (Normalized Total Answered × 0.3) + (Normalized Longest Streak × 0.2)</em><br>
        Where:<br>
        Normalized Total Answered = min(total answered, 250) ÷ 250<br>
        Normalized Longest Streak = min(longest streak, 30) ÷ 30<br>
        This means that answering just a few questions perfectly won't automatically rank you at the top; sustained engagement and working through a substantial portion of our question bank is key to a high composite score.
      </li>
      <li>
        <strong>Who Can Access the Leaderboards?</strong><br>
        In our MVP, all users have access to the leaderboards and performance metrics. In the future, if we move to a freemium model, basic leaderboard data will remain free while more detailed analytics may be reserved for registered or premium users.
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
