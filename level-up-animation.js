// Function to show the level-up modal and animation
function showLevelUpAnimation(newLevel, totalXP) {
  // Create modal if it doesn't exist
  if (!document.getElementById('levelUpModal')) {
    const modalHTML = `
      <div id="levelUpModal">
        <div id="levelUpContent">
          <div id="levelUpHeader">
            <h2 id="levelUpTitle">LEVEL UP!</h2>
          </div>
          <div id="levelUpBadge">
            <span id="levelNumber"></span>
          </div>
          <div id="levelUpBody">
            <p id="levelUpMessage">You've reached a new level!</p>
            <p id="levelUpXP"></p>
            <button id="levelUpButton">Continue</button>
          </div>
        </div>
      </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
    
    // Add event listener to close button
    document.getElementById('levelUpButton').addEventListener('click', function() {
      hideLevelUpModal();
    });
  }
  
  // Update modal content
  const levelNumber = document.getElementById('levelNumber');
  const levelUpXP = document.getElementById('levelUpXP');
  const levelUpMessage = document.getElementById('levelUpMessage');
  
  levelNumber.textContent = newLevel;
  levelUpXP.textContent = `Total XP: ${totalXP}`;
  
  // Custom messages based on level
  if (newLevel >= 10) {
    levelUpMessage.textContent = "Amazing progress! You've reached an elite level!";
  } else if (newLevel >= 5) {
    levelUpMessage.textContent = "Great job! You're becoming a master!";
  } else {
    levelUpMessage.textContent = "Congratulations! Keep up the good work!";
  }
  
  // Show the modal
  const modal = document.getElementById('levelUpModal');
  modal.style.display = 'flex';
  
  // Add fade in effect
  setTimeout(() => {
    modal.style.opacity = '1';
  }, 10);
  
  // Create confetti effect
  createConfetti();
  
  // Play sound effect if available
  if (window.Audio) {
    try {
      const levelUpSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000.wav');
      levelUpSound.volume = 0.5;
      levelUpSound.play();
    } catch (e) {
      console.log("Sound could not be played", e);
    }
  }
}

// Function to hide the level-up modal
function hideLevelUpModal() {
  const modal = document.getElementById('levelUpModal');
  if (modal) {
    modal.style.opacity = '0';
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
  }
}

// Function to create confetti effect
function createConfetti() {
  const colors = ['#FFC700', '#FF3D00', '#00C853', '#2979FF', '#AA00FF', '#D500F9'];
  const modal = document.getElementById('levelUpModal');
  
  // Remove old confetti
  const oldConfetti = modal.querySelectorAll('.confetti');
  oldConfetti.forEach(c => c.remove());
  
  // Create new confetti pieces
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.top = Math.random() * 50 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    
    // Random size between 5px and 10px
    const size = 5 + Math.random() * 5;
    confetti.style.width = `${size}px`;
    confetti.style.height = `${size}px`;
    
    // Random animation delay
    confetti.style.animationDelay = Math.random() * 1.5 + 's';
    
    modal.appendChild(confetti);
  }
}

// Modify the recordAnswer function to detect level-ups
// This snippet should be added inside the existing transaction in recordAnswer
// Place it right after updating the level based on XP

/*
// Calculate new level based on XP
const newLevel = calculateLevel(data.stats.xp);

// Check if the user leveled up
if (newLevel > data.stats.level) {
  data.stats.level = newLevel;
  
  // After the transaction completes, show the level-up animation
  setTimeout(() => {
    showLevelUpAnimation(newLevel, data.stats.xp);
  }, 1000);
}
*/
