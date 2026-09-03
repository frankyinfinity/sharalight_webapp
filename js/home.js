/**
 * Home (area riservata).
 * - Se non c'è un token → redirect al login.
 * - Carica i dati dell'utente e mostra "Benvenuto {nome} {cognome}".
 * - Mostra la griglia dei moduli: per aggiungerne uno basta estendere MODULES.
 * - Il pulsante Logout revoca il token e torna al login.
 */

// Catalogo moduli disponibili nella webapp.
// key    = identificativo univoco (usato come classe CSS)
// title  = nome del modulo
// desc   = breve descrizione
// icon   = emoji
// href   = pagina di destinazione
const MODULES = [
    {
        key: 'orders',
        title: 'Ordini',
        desc: 'I tuoi ordini cliente, nuovi ed esistenti.',
        icon: '📦',
        href: 'orders.html',
    },
];

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

        document.getElementById('welcome').textContent = 'Ciao 👋';
        nameEl.textContent = `${user.first_name} ${user.last_name}`.trim();
        emailEl.textContent = user.email;
    } catch (error) {
        // In caso di errore (es. token revocato) api.js reindirizza già al login
        showAlert(error.message);
        logoutBtn.disabled = true;
        return;
    }

    renderModules();

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

/**
 * Renderizza i pulsanti-modulo come schede cliccabili.
 * Ogni scheda è un <a> così funziona anche l'apertura con tasto centrale/nuova tab.
 */
function renderModules() {
    const grid = document.getElementById('modules-grid');
    if (!grid) return;

    grid.innerHTML = MODULES.map((module) => `
        <a href="${module.href}" class="module-btn module-btn-${module.key}" title="${module.desc}">
            <span class="module-icon" aria-hidden="true">${module.icon}</span>
            <span class="module-title">${module.title}</span>
            <span class="module-desc">${module.desc}</span>
        </a>
    `).join('');
}
