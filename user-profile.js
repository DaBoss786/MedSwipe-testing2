// user-profile.js - Fixed version
import { app, auth, db, doc, getDoc, runTransaction, serverTimestamp, collection, getDocs, getIdToken, sendPasswordResetEmail, functions, httpsCallable, updateDoc } from './firebase-config.js'; // Adjust path if needed
import { closeUserMenu } from './utils.js';

document.addEventListener('DOMContentLoaded', function() {
  // Update user profile UI based on auth state - without creating new UI elements
  function updateUserProfileUI(authState) {
    // We're skipping the profile creation since you don't want it
    return;
  }
  
  // Update the user info section in the user menu
  async function updateUserMenuInfo(authState) {
    const usernameDisplay = document.getElementById('usernameDisplay');
    const manageSubBtn = document.getElementById('manageSubscriptionBtn'); // Get manage button
    if (!usernameDisplay) return;
    
    // Update username display
    if (authState.isRegistered && authState.user) {
      const displayName = authState.user.displayName || authState.user.email || 'User';
      usernameDisplay.textContent = displayName;
      
      // Add logout button if it doesn't exist
      let logoutButton = document.getElementById('logoutButton');
      if (!logoutButton) {
        const userMenuList = document.getElementById('userMenuList');
        if (userMenuList) {
          // Remove any guest-specific items
          const registerButton = document.getElementById('guestRegisterButton');
          const loginButton = document.getElementById('guestLoginButton');
          if (registerButton && registerButton.parentElement) registerButton.parentElement.remove();
          if (loginButton && loginButton.parentElement) loginButton.parentElement.remove();
          
          // Add logout button
          const logoutItem = document.createElement('li');
          logoutButton = document.createElement('a');
          logoutButton.id = 'logoutButton';
          logoutButton.href = '#';
          logoutButton.textContent = 'Log Out';
          logoutItem.appendChild(logoutButton);
          userMenuList.appendChild(logoutItem);
          
          // Add logout functionality
          logoutButton.addEventListener('click', async function(e) {
            e.preventDefault();
            try {
              await window.authFunctions.logoutUser();
              // Close the menu
              closeUserMenu();
            } catch (error) {
              console.error('Error logging out:', error);
            }
          });
        }
      }

      // --- Show/Hide Manage Subscription Button ---
      if (manageSubBtn) { // Check if button exists
        try {
            // Fetch user data to check for stripeCustomerId
            const userDocRef = doc(db, 'users', authState.user.uid); // Use imported doc/db
            const userDocSnap = await getDoc(userDocRef); // Use imported getDoc

            if (userDocSnap.exists() && userDocSnap.data().stripeCustomerId) {
                // User has a Stripe Customer ID, likely subscribed
                manageSubBtn.style.display = 'block'; // Show the button
                console.log("User has stripeCustomerId, showing Manage Subscription button.");
            } else {
                // No Stripe Customer ID found
                manageSubBtn.style.display = 'none'; // Hide the button
                console.log("User does not have stripeCustomerId, hiding Manage Subscription button.");
            }
        } catch (error) {
             console.error("Error checking for stripeCustomerId:", error);
             manageSubBtn.style.display = 'none'; // Hide on error
        }
    }
    // --- End Show/Hide Manage Subscription Button ---

    } else {
      // For anonymous users, show guest username
      usernameDisplay.textContent = 'Guest User';
      
      // Add register and login buttons for guests
      const userMenuList = document.getElementById('userMenuList');
      if (userMenuList) {
        // Remove logout button if it exists
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton && logoutButton.parentElement) logoutButton.parentElement.remove();
        
        // Add Register button if it doesn't exist
        let registerButton = document.getElementById('guestRegisterButton');
        if (!registerButton) {
          const registerItem = document.createElement('li');
          registerButton = document.createElement('a');
          registerButton.id = 'guestRegisterButton';
          registerButton.href = '#';
          registerButton.textContent = 'Register Now';
          registerItem.appendChild(registerButton);
          userMenuList.insertBefore(registerItem, userMenuList.firstChild);
          
          // Add register functionality
          registerButton.addEventListener('click', function(e) {
            e.preventDefault();
            closeUserMenu();
            if (typeof window.showRegisterForm === 'function') {
              window.showRegisterForm();
            }
          });
        }
        
        // Add Login button if it doesn't exist
        let loginButton = document.getElementById('guestLoginButton');
        if (!loginButton) {
          const loginItem = document.createElement('li');
          loginButton = document.createElement('a');
          loginButton.id = 'guestLoginButton';
          loginButton.href = '#';
          loginButton.textContent = 'Log In';
          loginItem.appendChild(loginButton);
          
          const registerItem = document.getElementById('guestRegisterButton').parentElement;
          userMenuList.insertBefore(loginItem, registerItem.nextSibling);
          
          // Add login functionality
          loginButton.addEventListener('click', function(e) {
            e.preventDefault();
            closeUserMenu();
            if (typeof window.showLoginForm === 'function') {
              window.showLoginForm();
            }
          });
        }
      }
    }
  }
  
  // Listen for auth state changes and update UI
  window.addEventListener('authStateChanged', function(event) {
    updateUserProfileUI(event.detail);
    updateUserMenuInfo(event.detail);
  });
  
  // Initialize UI based on current auth state (if available)
  if (window.authState) {
    updateUserProfileUI(window.authState);
    updateUserMenuInfo(window.authState);
  }
});
