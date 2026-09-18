/**
 * Pagina Ordini (elenco).
 * - Se non c'è un token → redirect al login.
 * - Carica gli ordini dell'utente autenticato (GET /api/orders).
 * - Pulsante "Nuovo Ordine" → pagina di creazione.
 */

/**
 * Stati "interni" dell'ordine cliente (backend) raggruppati in 3 stati
 * mostrati al cliente:
 *   created / products_defined / products_allocated → "In lavorazione"
 *   in_shipment                                     → "In spedizione"
 *   shipped                                         → "Spedito"
 *
 * Nota: `state_label` restituito dall'API è l'etichetta interna
 * ("Creato", "Prodotti Definiti", …) e viene usata solo come tooltip.
 */
const STATE_LABELS = {
    created: 'In lavorazione',
    products_defined: 'In lavorazione',
    products_allocated: 'In lavorazione',
    in_shipment: 'In spedizione',
    shipped: 'Spedito',
};

// Colore del badge per ciascuno stato (un colore per gruppo)
const STATE_CLASSES = {
    created: 'in-progress',
    products_defined: 'in-progress',
    products_allocated: 'in-progress',
    in_shipment: 'in-shipment',
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
    const stateClass = STATE_CLASSES[order.state] || 'neutral';
    const stateLabel = STATE_LABELS[order.state] || order.state_label || order.state || '';
    const stateTitle = order.state_label && order.state_label !== stateLabel
        ? ` title="${escapeHtml(order.state_label)}"`
        : '';

    return `
        <article class="order-card">
            <div class="order-card-head">
                <strong class="order-progressive">#${escapeHtml(order.progressive)}</strong>
                <span class="badge badge-${stateClass}"${stateTitle}>${escapeHtml(stateLabel)}</span>
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
                ${order.price > 0 ? `
                <div class="order-card-row order-card-row-total">
                    <span class="order-card-label">Totale</span>
                    <span><strong>${escapeHtml(formatQnt(order.price))} €</strong></span>
                </div>` : ''}
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