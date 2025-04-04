// Login Screen Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const loginScreen = document.getElementById('loginScreen');
  const loginForm = document.getElementById('loginScreenForm');
  const emailInput = document.getElementById('loginScreenEmail');
  const passwordInput = document.getElementById('loginScreenPassword');
  const submitButton = document.getElementById('loginScreenSubmit');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const loginError = document.getElementById('loginScreenError');
  const passwordToggle = document.getElementById('passwordToggle');
  const loginLoader = document.getElementById('loginLoader');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const createAccountBtn = document.getElementById('createAccountBtn');
  const continueAsGuestBtn = document.getElementById('continueAsGuestBtn');
  
  // Form validation flags
  let isEmailValid = false;
  let isPasswordValid = false;
  
  // Email validation function
  function validateEmail() {
    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (email === '') {
      emailError.textContent = 'Email is required';
      emailInput.parentElement.classList.add('error');
      emailInput.parentElement.classList.remove('success');
      isEmailValid = false;
    } else if (!emailRegex.test(email)) {
      emailError.textContent = 'Please enter a valid email address';
      emailInput.parentElement.classList.add('error');
      emailInput.parentElement.classList.remove('success');
      isEmailValid = false;
    } else {
      emailError.textContent = '';
      emailInput.parentElement.classList.remove('error');
      emailInput.parentElement.classList.add('success');
      isEmailValid = true;
    }
    
    updateSubmitButtonState();
  }
  
  // Password validation function
  function validatePassword() {
    const password = passwordInput.value;
    
    if (password === '') {
      passwordError.textContent = 'Password is required';
      passwordInput.closest('.form-group').classList.add('error');
      passwordInput.closest('.form-group').classList.remove('success');
      isPasswordValid = false;
    } else if (password.length < 6) {
      passwordError.textContent = 'Password must be at least 6 characters';
      passwordInput.closest('.form-group').classList.add('error');
      passwordInput.closest('.form-group').classList.remove('success');
      isPasswordValid = false;
    } else {
      passwordError.textContent = '';
      passwordInput.closest('.form-group').classList.remove('error');
      passwordInput.closest('.form-group').classList.add('success');
      isPasswordValid = true;
    }
    
    updateSubmitButtonState();
  }
  
  // Update submit button state based on validation
  function updateSubmitButtonState() {
    submitButton.disabled = !(isEmailValid && isPasswordValid);
  }
  
  // Toggle password visibility
  function togglePasswordVisibility() {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      passwordToggle.innerHTML = '<i class="eye-icon">👁️‍🗨️</i>';
      passwordToggle.setAttribute('aria-label', 'Hide password');
    } else {
      passwordInput.type = 'password';
      passwordToggle.innerHTML = '<i class="eye-icon">👁️</i>';
      passwordToggle.setAttribute('aria-label', 'Show password');
    }
  }
  
  // Show login screen
  window.showLoginScreen = function() {
    // Reset form
    loginForm.reset();
    emailError.textContent = '';
    passwordError.textContent = '';
    loginError.textContent = '';
    emailInput.parentElement.classList.remove('error', 'success');
    passwordInput.closest('.form-group').classList.remove('error', 'success');
    submitButton.disabled = true;
    isEmailValid = false;
    isPasswordValid = false;
    
    // Show login screen
    if (loginScreen) {
      loginScreen.classList.add('show');
    }
  };
  
  // Hide login screen
  window.hideLoginScreen = function() {
    if (loginScreen) {
      loginScreen.classList.remove('show');
      
      // Hide with delay to allow for transition
      setTimeout(() => {
        loginScreen.style.display = 'none';
      }, 500);
    }
  };
  
  // Handle form submission
  async function handleLogin(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Show loader
    loginLoader.classList.add('show');
    loginError.textContent = '';
    
    try {
      // Attempt login
      await window.authFunctions.loginUser(email, password);
      
      // Successful login
      loginLoader.classList.remove('show');
      
      // Hide login screen and show main options/dashboard
      hideLoginScreen();
      document.getElementById('mainOptions').style.display = 'flex';
      
    } catch (error) {
      // Failed login
      loginLoader.classList.remove('show');
      loginError.textContent = getAuthErrorMessage(error);
      
      // Shake animation for error
      loginForm.classList.add('shake');
      setTimeout(() => {
        loginForm.classList.remove('shake');
      }, 500);
    }
  }
  
  // Get user-friendly error message
  function getAuthErrorMessage(error) {
    const errorCode = error.code;
    
    switch (errorCode) {
      case 'auth/invalid-email':
        return 'Invalid email address format';
      case 'auth/user-disabled':
        return 'This account has been disabled';
      case 'auth/user-not-found':
        return 'No account found with this email';
      case 'auth/wrong-password':
        return 'Incorrect password';
      case 'auth/too-many-requests':
        return 'Too many login attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      default:
        return error.message || 'An unknown error occurred';
    }
  }
  
  // Handle forgot password
  function handleForgotPassword(e) {
  e.preventDefault();
  
  // Use the existing password reset functionality
  if (typeof showForgotPasswordModal === 'function') {
    showForgotPasswordModal();
  } else {
    // Fallback if function not available yet
    console.error("showForgotPasswordModal function not found");
    alert('Error accessing password reset. Please try again later.');
  }
}
  
  // Handle create account
  function handleCreateAccount() {
    hideLoginScreen();
    window.showRegisterForm(); // Access the function through the window object
  }
  
  // Handle continue as guest
  function handleContinueAsGuest() {
    hideLoginScreen();
    document.getElementById('mainOptions').style.display = 'flex';
  }
  
  // Add event listeners
  if (emailInput) {
    emailInput.addEventListener('input', validateEmail);
    emailInput.addEventListener('blur', validateEmail);
  }
  
  if (passwordInput) {
    passwordInput.addEventListener('input', validatePassword);
    passwordInput.addEventListener('blur', validatePassword);
  }
  
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  if (passwordToggle) {
    passwordToggle.addEventListener('click', togglePasswordVisibility);
  }
  
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', handleForgotPassword);
  }
  
  if (createAccountBtn) {
    createAccountBtn.addEventListener('click', handleCreateAccount);
  }
  
  if (continueAsGuestBtn) {
    continueAsGuestBtn.addEventListener('click', handleContinueAsGuest);
  }
  
  // Add shake animation for form errors
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    .shake {
      animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    }
  `;
  document.head.appendChild(style);
});
