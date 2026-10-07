/**
 * Pagina "Pagamento Completato" — gestisce il redirect da PayPal.
 *
 * Flusso:
 *  1. PayPal reindirizza qui con token e PayerID nell'URL.
 *  2. Estrae il paypal_order_id dai parametri URL.
 *  3. Chiama POST /api/payments/capture per finalizzare il pagamento.
 *  4. Mostra il successo e reindirizza alla pagina ordini.
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const paypalOrderId = urlParams.get('token');
    const payerId = urlParams.get('PayerID');

    if (!paypalOrderId) {
        showAlert('Token PayPal mancante. Riprova.', 'error');
        setTimeout(() => { window.location.href = 'orders.html'; }, 2000);
        return;
    }

    try {
        // Cattura il pagamento PayPal
        const response = await apiRequest('/payments/capture', {
            method: 'POST',
            body: { paypal_order_id: paypalOrderId },
            auth: true
        });

        if (response.success) {
            const payment = response.payment;
            const order = payment.customer_order;

            document.getElementById('spinner').classList.add('hidden');
            document.getElementById('payment-details').classList.remove('hidden');
            document.getElementById('order-progressive').textContent = order.progressive;
            document.getElementById('payment-amount').textContent = fmtEur(Number(payment.amount));
            document.getElementById('go-to-orders').classList.remove('hidden');

            // Pulisci sessionStorage
            sessionStorage.removeItem('pending_payment_id');
            sessionStorage.removeItem('pending_order_id');

            document.getElementById('go-to-orders').addEventListener('click', () => {
                window.location.href = 'orders.html';
            });
        } else {
            throw new Error(response.message || 'Errore nella cattura del pagamento.');
        }
    } catch (error) {
        document.getElementById('spinner').classList.add('hidden');
        showAlert(error.message || 'Errore durante il pagamento.', 'error');
        
        setTimeout(() => { window.location.href = 'orders.html'; }, 3000);
    }
});

function fmtEur(n) {
    return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function showAlert(message, type = 'error') {
    const alertEl = document.getElementById('alert');
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    alertEl.classList.remove('hidden');
}
