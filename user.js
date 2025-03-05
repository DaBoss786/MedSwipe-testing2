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

// Function to show the level-up modal and animation
function showLevelUpAnimation(newLevel, totalXP) {
  // Remove any existing level up elements
  const existingLevelUps = document.querySelectorAll('body > :not([id])');
  existingLevelUps.forEach(node => {
    if (node.textContent && node.textContent.includes('LEVEL UP')) {
      node.remove();
    }
  });
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('levelUpModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'levelUpModal';
    modal.innerHTML = `
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
    `;
    
    document.body.appendChild(modal);
    
    // Add event listener to close button
    document.getElementById('levelUpButton').addEventListener('click', function() {
      hideLevelUpModal();
    });
  }
  
  // Update modal content
  const levelNumber = document.getElementById('levelNumber');
  const levelUpXP = document.getElementById('levelUpXP');
  const levelUpMessage = document.getElementById('levelUpMessage');
  
  if (levelNumber) levelNumber.textContent = newLevel;
  if (levelUpXP) levelUpXP.textContent = `Total XP: ${totalXP}`;
  
  // Custom messages based on level
  if (levelUpMessage) {
    if (newLevel >= 10) {
      levelUpMessage.textContent = "Amazing progress! You've reached an elite level!";
    } else if (newLevel >= 5) {
      levelUpMessage.textContent = "Great job! You're becoming a master!";
    } else {
      levelUpMessage.textContent = "Congratulations! Keep up the good work!";
    }
  }
  
  // Show the modal with proper styling
  if (modal) {
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
  
  if (!modal) return;
  
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

// Clean up any existing LEVEL UP text on page load
document.addEventListener('DOMContentLoaded', function() {
  // Clean up any existing LEVEL UP text
  const textNodes = document.querySelectorAll('body > *:not([id])');
  textNodes.forEach(node => {
    if (node.textContent && node.textContent.includes('LEVEL UP')) {
      node.remove();
    }
  });
});
