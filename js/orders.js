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

// Badge pagamento
const PAYMENT_LABELS = {
    pending: 'Pagamento in attesa',
    completed: 'Pagato',
    failed: 'Pagamento fallito',
    cancelled: 'Pagamento annullato',
};

const PAYMENT_CLASSES = {
    pending: 'in-progress',
    completed: 'shipped',
    failed: 'neutral',
    cancelled: 'neutral',
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

    // Event delegation for retry payment buttons
    document.getElementById('orders-list').addEventListener('click', async (event) => {
        const retryBtn = event.target.closest('[data-action="retry-payment"]');
        if (retryBtn) {
            const orderId = retryBtn.dataset.orderId;
            await retryPayment(orderId, retryBtn);
        }
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

    // Payment badge
    let paymentBadge = '';
    if (order.payment) {
        const paymentClass = PAYMENT_CLASSES[order.payment.status] || 'neutral';
        const paymentLabel = PAYMENT_LABELS[order.payment.status] || order.payment.status;
        paymentBadge = `<span class="badge badge-${paymentClass}" style="margin-left: 6px;">${escapeHtml(paymentLabel)}</span>`;
    }

    // Retry payment button for pending/failed payments
    let retryButton = '';
    if (order.payment && (order.payment.status === 'pending' || order.payment.status === 'failed')) {
        retryButton = `
            <button type="button" class="btn btn-secondary btn-sm" data-order-id="${order.id}" data-action="retry-payment">
                Riprova pagamento
            </button>
        `;
    }

    return `
        <article class="order-card" data-order-id="${order.id}">
            <div class="order-card-head">
                <strong class="order-progressive">#${escapeHtml(order.progressive)}</strong>
                <div>
                    <span class="badge badge-${stateClass}"${stateTitle}>${escapeHtml(stateLabel)}</span>
                    ${paymentBadge}
                </div>
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
                ${order.payment && order.payment.paid_at ? `
                <div class="order-card-row">
                    <span class="order-card-label">Pagato il</span>
                    <span>${escapeHtml(order.payment.paid_at)}</span>
                </div>` : ''}
            </div>
            ${retryButton ? `
            <div style="margin-top: 12px;">
                ${retryButton}
            </div>` : ''}
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

async function retryPayment(orderId, button) {
    button.disabled = true;
    button.textContent = 'Preparazione…';

    try {
        // Crea il pagamento PayPal per l'ordine esistente
        const paymentResponse = await apiRequest('/payments/create', {
            method: 'POST',
            body: { order_id: orderId },
            auth: true
        });

        if (!paymentResponse.success || !paymentResponse.approval_url) {
            throw new Error('Errore nella creazione del pagamento PayPal.');
        }

        // Salva l'ID del pagamento per il redirect dopo PayPal
        sessionStorage.setItem('pending_payment_id', paymentResponse.payment_id);
        sessionStorage.setItem('pending_order_id', orderId);

        // Reindirizza a PayPal per l'approvazione
        window.location.href = paymentResponse.approval_url;

    } catch (error) {
        button.disabled = false;
        button.textContent = 'Riprova pagamento';
        alert(error.message || 'Errore durante la preparazione del pagamento.');
    }
}