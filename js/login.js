/**
 * Pagina di login.
 * Se è già presente un token valido l'utente viene reindirizzato alla home.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Già autenticato → home
    if (getToken()) {
        window.location.href = 'home.html';
        return;
    }

    const form = document.getElementById('login-form');
    const btn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearInvalidStates(form);
        hideAlert();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showAlert('Inserisci email e password.');
            return;
        }

        setLoading(btn, true);

        try {
            const data = await apiRequest('/login', {
                method: 'POST',
                body: { email, password },
            });

            setToken(data.token);
            window.location.href = 'home.html';
        } catch (error) {
            if (error.errors && Object.keys(error.errors).length > 0) {
                showValidationErrors(error.errors);
            } else {
                showAlert(error.message);
            }
            setLoading(btn, false);
        }
    });
});

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Accesso in corso…' : 'Accedi';
}
