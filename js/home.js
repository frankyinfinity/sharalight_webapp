/**
 * Home (area riservata).
 * - Se non c'è un token → redirect al login.
 * - Carica i dati dell'utente e mostra "Benvenuto {nome} {cognome}".
 * - Il pulsante Logout revoca il token e torna al login.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');

    // Protezione pagina: senza token non si entra
    if (!getToken()) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const data = await apiRequest('/user', { auth: true });
        const user = data.user;

        document.getElementById('welcome').textContent = 'Benvenuto';
        nameEl.textContent = `${user.first_name} ${user.last_name}`.trim();
        emailEl.textContent = user.email;
    } catch (error) {
        // In caso di errore (es. token revocato) api.js reindirizza già al login
        showAlert(error.message);
        logoutBtn.disabled = true;
        return;
    }

    logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        logoutBtn.textContent = 'Uscita…';

        try {
            await apiRequest('/logout', { method: 'POST', auth: true });
        } catch (_) {
            // Anche se la chiamata fallisce, si esce comunque
        }

        clearToken();
        window.location.href = 'index.html';
    });
});
