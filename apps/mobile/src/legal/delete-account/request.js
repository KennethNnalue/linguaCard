const form = document.querySelector('#deletion-request-form');
const message = document.querySelector('#form-message');
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async event => {
  event.preventDefault();
  submitButton.disabled = true;
  message.className = 'message';
  message.textContent = 'Submitting your request…';

  try {
    const response = await fetch('https://linguacard-api.onrender.com/api/v1/account-deletion-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: new FormData(form).get('email') }),
    });
    if (!response.ok) throw new Error('Request failed');

    form.reset();
    message.textContent = 'If that email belongs to a LinguaCard account, the deletion request has been recorded. We will contact you to verify ownership.';
  } catch {
    message.className = 'message message--error';
    message.textContent = 'We could not submit the request. Please try again or contact support by email.';
  } finally {
    submitButton.disabled = false;
  }
});
