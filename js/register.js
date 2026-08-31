/**
 * Pagina di registrazione.
 * Dopo la registrazione l'utente viene automaticamente autenticato
 * (il backend restituisce già il token) e reindirizzato alla home.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Già autenticato → home
    if (getToken()) {
        window.location.href = 'home.html';
        return;
    }

    const form = document.getElementById('register-form');
    const btn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearInvalidStates(form);
        hideAlert();

        const payload = {
            first_name: document.getElementById('first_name').value.trim(),
            last_name: document.getElementById('last_name').value.trim(),
            email: document.getElementById('email').value.trim(),
            password: document.getElementById('password').value,
            password_confirmation: document.getElementById('password_confirmation').value,
        };

        if (!payload.first_name || !payload.last_name || !payload.email || !payload.password) {
            showAlert('Compila tutti i campi.');
            return;
        }

        if (payload.password.length < 8) {
            showAlert('La password deve contenere almeno 8 caratteri.');
            document.getElementById('password').classList.add('invalid');
            return;
        }

        if (payload.password !== payload.password_confirmation) {
            showAlert('Le due password non coincidono.');
            document.getElementById('password').classList.add('invalid');
            document.getElementById('password_confirmation').classList.add('invalid');
            return;
        }

        setLoading(btn, true);

        try {
            const data = await apiRequest('/register', {
                method: 'POST',
                body: payload,
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
    btn.textContent = loading ? 'Registrazione in corso…' : 'Registrati';
}
