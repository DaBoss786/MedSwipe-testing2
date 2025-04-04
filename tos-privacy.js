// TOS and Privacy Policy Modal Handlers
document.addEventListener('DOMContentLoaded', function() {
  const viewTOS = document.getElementById('viewTOS');
  const viewPrivacy = document.getElementById('viewPrivacy');
  const termsOfServiceModal = document.getElementById('termsOfServiceModal');
  const privacyPolicyModal = document.getElementById('privacyPolicyModal');
  const closeModalButtons = document.querySelectorAll('.close-modal');

  // Open TOS Modal
  viewTOS.addEventListener('click', function(e) {
    e.preventDefault();
    termsOfServiceModal.style.display = 'flex';
  });

  // Open Privacy Policy Modal
  viewPrivacy.addEventListener('click', function(e) {
    e.preventDefault();
    privacyPolicyModal.style.display = 'flex';
  });

  // Close Modal Buttons
  closeModalButtons.forEach(button => {
    button.addEventListener('click', function() {
      termsOfServiceModal.style.display = 'none';
      privacyPolicyModal.style.display = 'none';
    });
  });

  // Close modals when clicking outside
  [termsOfServiceModal, privacyPolicyModal].forEach(modal => {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
  });
});

