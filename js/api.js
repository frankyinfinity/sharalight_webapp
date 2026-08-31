/**
 * Shara Light — Webapp
 * Configurazione e client per le API del backend Laravel.
 *
 * Autenticazione via token (Laravel Sanctum):
 *   Authorization: Bearer <token>
 * Il token è salvato in localStorage dopo login/registrazione.
 */

// ⚙️ URL base delle API del backend (artisan serve → http://localhost:8000)
const API_BASE_URL = 'http://localhost:8000/api';

// Chiave usata per salvare il token in localStorage
const TOKEN_KEY = 'shara_light_token';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Chiama un endpoint delle API.
 *
 * @param {string} path           Es. '/login', '/user'
 * @param {object} [options]
 * @param {string} [options.method]  Metodo HTTP (default GET)
 * @param {object|null} [options.body] Corpo JSON della richiesta
 * @param {boolean} [options.auth]  true = invia il token salvato
 * @returns {Promise<object>} Dati JSON della risposta
 */
async function apiRequest(path, { method = 'GET', body = null, auth = false } = {}) {
    const headers = { 'Accept': 'application/json' };

    if (body) {
        headers['Content-Type'] = 'application/json';
    }

    if (auth) {
        const token = getToken();
        if (!token) {
            window.location.href = 'index.html';
            throw new Error('Sessione assente');
        }
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (networkError) {
        throw new Error('Impossibile contattare il server. Verifica che il backend sia avviato.');
    }

    let data = null;
    try {
        data = await response.json();
    } catch (_) {
        // risposta non JSON
    }

    if (!response.ok) {
        // Token non valido o scaduto → torna al login
        if (response.status === 401 && auth) {
            clearToken();
            window.location.href = 'index.html';
            throw new Error('Sessione scaduta');
        }

        const error = new Error(data?.message || `Errore ${response.status}`);
        error.status = response.status;
        error.errors = data?.errors || {};
        throw error;
    }

    return data;
}

/**
 * Mostra un messaggio nell'elemento #alert della pagina.
 */
function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('alert');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.classList.remove('hidden', 'alert-error', 'alert-success');
    alertBox.classList.add(`alert-${type}`);
}

function hideAlert() {
    const alertBox = document.getElementById('alert');
    if (!alertBox) return;
    alertBox.classList.add('hidden');
}

/**
 * Evidenzia i campi con errori di validazione e mostra il messaggio.
 */
function showValidationErrors(errors) {
    const firstMessage = Object.values(errors)[0]?.[0];
    if (firstMessage) showAlert(firstMessage, 'error');

    Object.keys(errors).forEach((field) => {
        const input = document.getElementById(field) ||
                      document.querySelector(`[name="${field}"]`);
        if (input) input.classList.add('invalid');
    });
}

function clearInvalidStates(form) {
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
}
