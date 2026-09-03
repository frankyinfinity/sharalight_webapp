/**
 * Pagina Ordini (elenco).
 * - Se non c'è un token → redirect al login.
 * - Carica gli ordini dell'utente autenticato (GET /api/orders).
 * - Pulsante "Nuovo Ordine" → pagina di creazione.
 */

// Etichette degli stati miniati per i badge
const STATE_CLASSES = {
    created: 'created',
    products_defined: 'products-defined',
    products_allocated: 'products-allocated',
    shipped: 'shipped',
};

document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        logoutBtn.textContent = 'Uscita…';
        try {
            await apiRequest('/logout', { method: 'POST', auth: true });
        } catch (_) { /* si esce comunque */ }
        clearToken();
        window.location.href = 'index.html';
    });

    document.getElementById('new-order-btn').addEventListener('click', () => {
        window.location.href = 'order-new.html';
    });

    loadOrders();
});

async function loadOrders() {
    const loadingEl = document.getElementById('orders-loading');
    const emptyEl = document.getElementById('orders-empty');
    const listEl = document.getElementById('orders-list');
    const countEl = document.getElementById('orders-count');

    try {
        const data = await apiRequest('/orders', { auth: true });
        const orders = data.orders || [];

        loadingEl.classList.add('hidden');
        countEl.textContent = orders.length === 1 ? '1 ordine' : `${orders.length} ordini`;

        if (orders.length === 0) {
            emptyEl.classList.remove('hidden');
            return;
        }

        listEl.innerHTML = orders.map(renderOrderCard).join('');
    } catch (error) {
        loadingEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        emptyEl.textContent = error.message;
    }
}

function renderOrderCard(order) {
    const stateClass = STATE_CLASSES[order.state] || '';

    return `
        <article class="order-card">
            <div class="order-card-head">
                <strong class="order-progressive">#${escapeHtml(order.progressive)}</strong>
                <span class="badge badge-${stateClass}">${escapeHtml(order.state_label)}</span>
            </div>
            <div class="order-card-body">
                <div class="order-card-row">
                    <span class="order-card-label">Data</span>
                    <span>${escapeHtml(order.order_date_fmt || '-')}</span>
                </div>
                <div class="order-card-row">
                    <span class="order-card-label">Indirizzo</span>
                    <span>${escapeHtml(order.address)}</span>
                </div>
                <div class="order-card-row">
                    <span class="order-card-label">Prodotti</span>
                    <span>${order.products_count ?? 0}</span>
                </div>
                <div class="order-card-row">
                    <span class="order-card-label">Quantità</span>
                    <span>${formatQnt(order.qnt ?? 0)}</span>
                </div>
            </div>
        </article>
    `;
}

function formatQnt(value) {
    const n = typeof value === 'number' ? value : parseFloat(value) || 0;
    return n.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}