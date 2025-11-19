
    const passwordInput = document.getElementById('Password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordButton = document.getElementById('submitDetails');
    const passwordFeedback = document.getElementById('passwordFeedback');
    const confirmPasswordFeedback = document.getElementById('confirmPasswordFeedback');

    let isPasswordValid = false;
    let isConfirmPasswordValid = false;

    // Utility function to toggle class names
    function toggleClass(element, isValid) {
        if (isValid) {
            element.classList.add('is-valid');
            element.classList.remove('is-invalid');
        } else {
            element.classList.add('is-invalid');
            element.classList.remove('is-valid');
        }
    }

    // Validate Password
        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;

            if (password.length >= 8) {
                isPasswordValid = true;
                passwordFeedback.textContent = '';
                toggleClass(passwordInput, true);
            } else {
                isPasswordValid = false;
                passwordFeedback.textContent = 'Password must be at least 8 characters long.';
                passwordFeedback.className = 'error';
                toggleClass(passwordInput, false);
            }

            toggleSubmitButton();
        });

        // Validate Confirm Password
        confirmPasswordInput.addEventListener('input', () => {
            const confirmPassword = confirmPasswordInput.value;

            if (confirmPassword === passwordInput.value) {
                isConfirmPasswordValid = true;
                confirmPasswordFeedback.textContent = '';
                toggleClass(confirmPasswordInput, true);
            } else {
                isConfirmPasswordValid = false;
                confirmPasswordFeedback.textContent = 'Passwords do not match.';
                confirmPasswordFeedback.className = 'error';
                toggleClass(confirmPasswordInput, false);
            }

            toggleSubmitButton();
        });

        function toggleSubmitButton() {
            passwordButton.disabled = !isPasswordValid;
            passwordButton.disabled = !isConfirmPasswordValid;
        }

    toggleSubmitButton();
