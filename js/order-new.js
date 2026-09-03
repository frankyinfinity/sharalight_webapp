/**
 * Pagina "Nuovo Ordine" (ordine cliente) — stile app.
 *
 * Flusso:
 *  1. Scarica il catalogo da GET /api/orders/catalog.
 *  2. L'utente compone l'ordine TUTTO IN LOCALE (bozza in localStorage):
 *     - sceglie prodotti e quantità;
 *     - per ogni prodotto apre un pannello "ingredienti" (una select per
 *       categoria, come nel backend) e sceglie la materia prima.
 *       I semi-lavorati mostrano le select annidate.
 *  3. Il salvataggio finale invia UN UNICO JSON a POST /api/orders.
 *     Il backend crea l'ordine già nello stato "Prodotti Definiti".
 */

const DRAFT_KEY = 'shara_light_order_draft';
const MAX_DEPTH = 5;

const CATEGORY_ICONS = {
    'Candela': '🕯️', 'Cera': '🧴', 'Stoppino': '🧵', 'Barattolo': '🫙',
    'Tappo': '🔘', 'Aromi': '🌸', 'Busta': '🎀',
};

// ---- Stato locale (bozza) ----
const state = {
    address: '',
    order_date: '',
    cart: [],        // { key, product_id, qnt, selections: { recipe_id: product_id } }
    nextKey: 1,
};

// Stato temporaneo della configurazione ingredienti (sheet, vista 2)
let configProductId = null;
let configSelections = {};   // { recipe_id: product_id } scelte correnti

let CATALOG = null;

// ============================================================
// Helper
// ============================================================

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const round4 = (n) => Math.round(n * 10000) / 10000;
const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n, digits = 2) => (Number.isFinite(n) ? n : 0)
    .toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const parseQnt = (value) => { const n = parseFloat(String(value ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

const productById = (id) => CATALOG.products.find((p) => p.id === Number(id)) || null;
const uomById = (id) => CATALOG.unit_of_measures.find((u) => u.id === Number(id)) || null;
const orderableProducts = () => CATALOG.products.filter((p) => p.type === 'semi_finished' || p.type === 'finished');
const recipesByProduct = (productId) => CATALOG.recipes.filter((r) => r.product_id === Number(productId));
const productsByCategory = (categoryId) => CATALOG.products.filter((p) => p.product_category_id === Number(categoryId));
const hasRecipe = (product) => product && (product.type === 'semi_finished' || product.type === 'finished');

function categoryIcon(name) {
    const key = Object.keys(CATEGORY_ICONS).find((k) => String(name ?? '').toLowerCase() === k.toLowerCase());
    return key ? CATEGORY_ICONS[key] : '📦';
}

function localStorageAvailable() {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (_) { return false; }
}

function convertQnt(quantity, fromId, toId) {
    if (!fromId || !toId || Number(fromId) === Number(toId)) return quantity;
    const inverse = CATALOG.unit_conversions.find((c) => Number(c.from_unit_of_measure_id) === Number(toId) && Number(c.to_unit_of_measure_id) === Number(fromId));
    if (inverse) return quantity * (inverse.from_quantity / inverse.to_quantity);
    const direct = CATALOG.unit_conversions.find((c) => Number(c.from_unit_of_measure_id) === Number(fromId) && Number(c.to_unit_of_measure_id) === Number(toId));
    if (direct) return quantity * (direct.to_quantity / direct.from_quantity);
    return quantity;
}

// ============================================================
// Persistenza bozza locale
// ============================================================

function persistDraft() {
    if (!localStorageAvailable()) return;
    const draft = {
        address: state.address,
        order_date: state.order_date,
        cart: state.cart.map((it) => ({ key: it.key, product_id: it.product_id, qnt: it.qnt, selections: { ...it.selections } })),
        nextKey: state.nextKey,
    };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (_) { /* ok */ }
}

function loadDraft() {
    if (!localStorageAvailable()) return;
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        state.address = draft.address || '';
        state.order_date = draft.order_date || '';
        state.nextKey = draft.nextKey || 1;
        state.cart = (draft.cart || []).map((it) => {
            if (!productById(it.product_id)) return null;
            return { key: it.key, product_id: Number(it.product_id), qnt: Math.max(1, parseQnt(it.qnt) || 1), selections: { ...(it.selections || {}) } };
        }).filter(Boolean);
    } catch (_) { /* bozza corrotta: si riparte da zero */ }
}

function clearDraft() {
    if (!localStorageAvailable()) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* ok */ }
}
// ============================================================
// Rendering
// ============================================================

function renderAll() {
    document.getElementById('order-address').value = state.address;
    document.getElementById('order-date').value = state.order_date;

    renderCart();
    renderTotal();
    renderQuickDates();
    renderSheetProductList();
}

function renderCart() {
    const listEl = document.getElementById('cart-list');
    const emptyEl = document.getElementById('cart-empty');

    if (state.cart.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = state.cart.map((item) => renderCartItem(item)).join('');
}

function renderCartItem(item) {
    const product = productById(item.product_id);
    const icon = categoryIcon(product?.category_name);

    return `
        <article class="cart-item" data-key="${item.key}">
            <span class="cart-item-icon" aria-hidden="true">${icon}</span>
            <div class="cart-item-info">
                <span class="cart-item-name">${esc(product?.name || 'Prodotto')}</span>
                <span class="cart-item-meta">${esc(product?.category_name || '')}${product?.unit_of_measure_symbol ? ' · ' + esc(product.unit_of_measure_symbol) : ''}</span>
            </div>
            <div class="stepper">
                <button type="button" class="step-btn step-minus" data-key="${item.key}" aria-label="Diminuisci">−</button>
                <input type="text" class="step-value" data-key="${item.key}" inputmode="decimal" value="${esc(item.qnt)}" aria-label="Quantità">
                <button type="button" class="step-btn step-plus" data-key="${item.key}" aria-label="Aumenta">+</button>
            </div>
            <button type="button" class="cart-item-remove" data-key="${item.key}" aria-label="Rimuovi">✕</button>
        </article>
    `;
}

function renderTotal() {
    const total = state.cart.reduce((sum, item) => sum + parseQnt(item.qnt), 0);
    const allPieces = state.cart.length > 0 && state.cart.every((item) => Number(productById(item.product_id)?.unit_of_measure_id) === 1);
    document.getElementById('order-total').textContent = allPieces ? `${fmt(total, 2)} PZ` : fmt(total, 2);
}

function renderQuickDates() {
    document.querySelectorAll('.qd-chip').forEach((chip) => {
        const iso = addDays(Number(chip.dataset.days)).toISOString().slice(0, 10);
        chip.classList.toggle('active', state.order_date === iso);
    });
}

function addDays(days) { const d = new Date(); d.setDate(d.getDate() + days); return d; }

// ---- Sheet: vista 1 (elenco prodotti) ----

function renderSheetProductList() {
    const listEl = document.getElementById('product-sheet-list');
    const inCart = (id) => state.cart.some((it) => Number(it.product_id) === Number(id));

    listEl.innerHTML = orderableProducts().map((p) => `
        <button type="button" class="sheet-item ${inCart(p.id) ? 'added' : ''}" data-product-id="${p.id}">
            <span class="sheet-item-icon" aria-hidden="true">${categoryIcon(p.category_name)}</span>
            <span class="sheet-item-body">
                <span class="sheet-item-name">${esc(p.name)}</span>
            </span>
            <span class="sheet-item-add" aria-hidden="true">${inCart(p.id) ? '✓' : '+'}</span>
        </button>
    `).join('');
}
// ---- Sheet: vista 2 (configurazione ingredienti) ----

function openProductConfig(productId) {
    configProductId = Number(productId);
    configSelections = {};

    const product = productById(productId);
    document.getElementById('sheet-config-title').textContent = product?.name || 'Prodotto';
    document.getElementById('sheet-qnt-input').value = 1;

    renderIngredientConfig();

    document.getElementById('sheet-view-list').hidden = true;
    document.getElementById('sheet-view-config').hidden = false;
}

function goBackToProductList() {
    configProductId = null;
    configSelections = {};
    document.getElementById('sheet-view-config').hidden = true;
    document.getElementById('sheet-view-list').hidden = false;
    renderSheetProductList();
}

/**
 * Renderizza le righe "ingrediente" (una select per categoria) in modo
 * ricorsivo: se la materia prima scelta è un semi-lavorato, mostra le
 * select annidate per le sue ricette.
 */
function renderIngredientConfig() {
    const listEl = document.getElementById('sheet-ing-list');
    listEl.innerHTML = ingredientRowsHtml(configProductId, [configProductId], 0);
}

function ingredientRowsHtml(productId, excluded, depth) {
    if (depth > MAX_DEPTH) return '';

    return recipesByProduct(productId).map((recipe) => {
        const selectedId = selectedIngredientForRecipe(recipe, excluded);
        const available = productsByCategory(recipe.product_category_id)
            .filter((p) => !excluded.includes(p.id))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const options = available
            .map((p) => `<option value="${p.id}" ${Number(selectedId) === Number(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`)
            .join('');

        const selectedProduct = productById(selectedId);
        let nested = '';
        if (selectedProduct && hasRecipe(selectedProduct)) {
            nested = `<div class="ing-nested">${ingredientRowsHtml(selectedProduct.id, [...excluded, selectedProduct.id], depth + 1)}</div>`;
        }

        return `
            <div class="ing-row" data-depth="${depth}">
                <div class="ing-row-top">
                    <span class="ing-cat">${esc(recipe.category_name)}</span>
                    <select class="ing-select" data-recipe-id="${recipe.id}">${options}</select>
                </div>
                ${nested}
            </div>
        `;
    }).join('');
}

/**
 * Restituisce l'ingrediente selezionato per una ricetta: la scelta utente
 * (se presente) altrimenti il default automatico.
 */
function selectedIngredientForRecipe(recipe, excluded) {
    if (configSelections[recipe.id] !== undefined) {
        return Number(configSelections[recipe.id]);
    }
    return autoSelectForRecipe(recipe, excluded);
}

/**
 * Default automatico: prodotto abilitato esplicitamente nella ricetta
 * (recipe_details) oppure primo disponibile della categoria.
 */
function autoSelectForRecipe(recipe, excludedIds) {
    const allowed = recipe.detail_product_ids || [];
    for (const pid of allowed) {
        if (!excludedIds.includes(Number(pid))) return Number(pid);
    }
    const candidates = productsByCategory(recipe.product_category_id)
        .filter((p) => !excludedIds.includes(p.id))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return candidates[0] ? candidates[0].id : null;
}

/**
 * Raccoglie le scelte utente dalla vista config (tutti i select).
 */
function collectConfigSelections() {
    const result = {};
    document.querySelectorAll('#sheet-ing-list .ing-select').forEach((sel) => {
        result[Number(sel.dataset.recipeId)] = Number(sel.value);
    });
    return result;
}

function addConfiguredProductToCart() {
    const qnt = parseQnt(document.getElementById('sheet-qnt-input').value);
    const finalQnt = round2(qnt > 0 ? qnt : 1);
    const selections = collectConfigSelections();

    state.cart.push({
        key: state.nextKey++,
        product_id: configProductId,
        qnt: finalQnt,
        selections,
    });

    renderCart();
    renderTotal();
    persistDraft();
    closeSheet();
}
// ============================================================
// Gestione carrello
// ============================================================

function itemByKey(key) {
    return state.cart.find((item) => item.key === Number(key));
}

function changeQty(key, delta) {
    const item = itemByKey(key);
    if (!item) return;
    item.qnt = round2(Math.max(1, parseQnt(item.qnt) + delta));
    updateQtyField(key);
    renderTotal();
    persistDraft();
}

function commitQty(input) {
    const item = itemByKey(input.dataset.key);
    if (!item) return;
    const value = parseQnt(input.value);
    item.qnt = round2(value > 0 ? value : 1);
    input.value = item.qnt;
    renderTotal();
    persistDraft();
}

function updateQtyField(key) {
    const input = document.querySelector(`.stepper .step-value[data-key="${key}"]`);
    const item = itemByKey(key);
    if (input && item) input.value = item.qnt;
}

function removeItem(key) {
    state.cart = state.cart.filter((item) => item.key !== Number(key));
    renderCart();
    renderTotal();
    persistDraft();
}

function highlightItem(key) {
    const card = document.querySelector(`.cart-item[data-key="${key}"]`);
    if (!card) return;
    card.classList.add('highlight');
    setTimeout(() => card.classList.remove('highlight'), 700);
}

// ============================================================
// Raccolta dei dettagli (ingredienti) per il payload finale
// ============================================================

function collectSelections(item) {
    const product = productById(item.product_id);
    const qnt = parseQnt(item.qnt) || 0;
    const out = [];
    walkSelections(item.product_id, qnt, product?.unit_of_measure_id, [Number(item.product_id)], 0, out, item.selections || null);
    return out;
}

function walkSelections(productId, parentQnt, parentUomId, excluded, depth, out, userSelections) {
    if (depth > MAX_DEPTH) return;

    for (const recipe of recipesByProduct(productId)) {
        let selectedProductId = null;

        if (userSelections && userSelections[recipe.id] !== undefined) {
            selectedProductId = Number(userSelections[recipe.id]);
        } else {
            selectedProductId = autoSelectForRecipe(recipe, excluded);
        }

        if (!selectedProductId) continue;

        const total = round4(recipe.quantity * convertQnt(parentQnt, parentUomId, recipe.unit_of_measure_id));
        const selectedProduct = productById(selectedProductId);
        const categoryUomId = selectedProduct ? selectedProduct.unit_of_measure_id : recipe.category_uom_id;
        const needsConversion = Number(recipe.unit_of_measure_id) !== Number(categoryUomId);

        out.push({
            recipe_id: recipe.id,
            product_id: selectedProductId,
            original_qnt: total,
            original_unit_of_measure_id: recipe.unit_of_measure_id,
            conversion_qnt: needsConversion ? round4(convertQnt(total, recipe.unit_of_measure_id, categoryUomId)) : null,
            conversion_unit_of_measure_id: needsConversion ? categoryUomId : null,
        });

        if (selectedProduct && hasRecipe(selectedProduct)) {
            walkSelections(selectedProduct.id, total, recipe.unit_of_measure_id, [...excluded, selectedProduct.id], depth + 1, out, userSelections);
        }
    }
}
// ============================================================
// Validazione e salvataggio (un unico JSON a POST /api/orders)
// ============================================================

function validateOrder(address, orderDate) {
    if (!address) return "Inserisci l'indirizzo di consegna.";
    if (!orderDate) return 'Seleziona la data di consegna.';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chosen = new Date(`${orderDate}T00:00:00`);
    if (Number.isNaN(chosen.getTime()) || chosen <= today) {
        return 'La data di consegna deve essere successiva a oggi.';
    }

    if (state.cart.length === 0) return "Aggiungi almeno un prodotto all'ordine.";

    for (let i = 0; i < state.cart.length; i++) {
        const item = state.cart[i];
        if (!item.product_id) return `Prodotto ${i + 1}: seleziona un prodotto.`;
        if (parseQnt(item.qnt) <= 0) return `Prodotto ${i + 1}: inserisci una quantità valida.`;
    }

    return null;
}

function buildPayload() {
    const address = document.getElementById('order-address').value.trim();
    const orderDate = document.getElementById('order-date').value;

    return {
        address,
        order_date: orderDate,
        products: state.cart.map((item) => {
            const product = productById(item.product_id);
            return {
                product_id: item.product_id,
                qnt: round2(parseQnt(item.qnt)),
                unit_of_measure_id: product?.unit_of_measure_id,
                details: collectSelections(item),
            };
        }),
    };
}

async function saveOrder() {
    hideAlert();

    const address = document.getElementById('order-address').value.trim();
    const orderDate = document.getElementById('order-date').value;

    const error = validateOrder(address, orderDate);
    if (error) {
        showAlert(error);
        return;
    }

    const payload = buildPayload();
    const btn = document.getElementById('save-order-btn');
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';

    try {
        await apiRequest('/orders', { method: 'POST', body: payload, auth: true });

        clearDraft();
        state.cart = [];
        renderAll();

        showAlert('Ordine salvato con successo!', 'success');
        setTimeout(() => { window.location.href = 'orders.html'; }, 900);
    } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Salva Ordine';

        if (err.errors && Object.keys(err.errors).length > 0) {
            showValidationErrors(err.errors);
        } else {
            showAlert(err.message);
        }
    }
}

// ============================================================
// Sheet open / close
// ============================================================

function openSheet() {
    goBackToProductList();
    const sheet = document.getElementById('product-sheet');
    const backdrop = document.getElementById('sheet-backdrop');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('open'));
}

function closeSheet() {
    const sheet = document.getElementById('product-sheet');
    const backdrop = document.getElementById('sheet-backdrop');
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('open');
    setTimeout(() => { backdrop.hidden = true; }, 200);
    configProductId = null;
    configSelections = {};
}
// ============================================================
// Inizializzazione
// ============================================================

function initEvents() {
    document.getElementById('add-product-btn').addEventListener('click', openSheet);
    document.getElementById('sheet-backdrop').addEventListener('click', closeSheet);

    // Vista 1: click su un prodotto apre la configurazione ingredienti
    document.getElementById('product-sheet-list').addEventListener('click', (event) => {
        const item = event.target.closest('.sheet-item');
        if (item) openProductConfig(item.dataset.productId);
    });

    // Vista 2: stepper quantità
    document.getElementById('sheet-qnt-minus').addEventListener('click', () => {
        const input = document.getElementById('sheet-qnt-input');
        input.value = round2(Math.max(1, parseQnt(input.value) - 1));
    });
    document.getElementById('sheet-qnt-plus').addEventListener('click', () => {
        const input = document.getElementById('sheet-qnt-input');
        input.value = round2(parseQnt(input.value) + 1);
    });
    document.getElementById('sheet-qnt-input').addEventListener('change', (event) => {
        const v = parseQnt(event.target.value);
        event.target.value = round2(v > 0 ? v : 1);
    });

    // Vista 2: cambio select → aggiorna annidamenti semi-lavorati
    document.getElementById('sheet-ing-list').addEventListener('change', (event) => {
        if (event.target.classList.contains('ing-select')) {
            configSelections[Number(event.target.dataset.recipeId)] = Number(event.target.value);
            renderIngredientConfig();
        }
    });

    // Vista 2: torna indietro / aggiungi al carrello
    document.getElementById('sheet-back-btn').addEventListener('click', goBackToProductList);
    document.getElementById('sheet-add-btn').addEventListener('click', addConfiguredProductToCart);

    // Carrello
    const cart = document.getElementById('cart-list');
    cart.addEventListener('click', (event) => {
        const minus = event.target.closest('.step-minus');
        if (minus) { changeQty(minus.dataset.key, -1); return; }
        const plus = event.target.closest('.step-plus');
        if (plus) { changeQty(plus.dataset.key, +1); return; }
        const remove = event.target.closest('.cart-item-remove');
        if (remove) removeItem(remove.dataset.key);
    });
    cart.addEventListener('change', (event) => {
        if (event.target.classList.contains('step-value')) commitQty(event.target);
    });

    // Dati consegna
    document.getElementById('order-address').addEventListener('input', (event) => {
        state.address = event.target.value;
        persistDraft();
    });
    document.getElementById('order-date').addEventListener('input', (event) => {
        state.order_date = event.target.value;
        renderQuickDates();
        persistDraft();
    });
    document.getElementById('quick-dates').addEventListener('click', (event) => {
        const chip = event.target.closest('.qd-chip');
        if (!chip) return;
        state.order_date = addDays(Number(chip.dataset.days)).toISOString().slice(0, 10);
        document.getElementById('order-date').value = state.order_date;
        renderQuickDates();
        persistDraft();
    });

    document.getElementById('save-order-btn').addEventListener('click', saveOrder);
}

function normalizeCatalog(data) {
    return {
        products: (data.products || []).map((p) => ({ ...p, id: Number(p.id), product_category_id: Number(p.product_category_id) })),
        recipes: (data.recipes || []).map((r) => ({
            ...r,
            id: Number(r.id),
            product_id: Number(r.product_id),
            product_category_id: Number(r.product_category_id),
            unit_of_measure_id: r.unit_of_measure_id ? Number(r.unit_of_measure_id) : null,
            category_uom_id: r.category_uom_id ? Number(r.category_uom_id) : null,
            detail_product_ids: (r.detail_product_ids || []).map((id) => Number(id)),
        })),
        unit_of_measures: (data.unit_of_measures || []).map((u) => ({ ...u, id: Number(u.id) })),
        unit_conversions: (data.unit_conversions || []).map((c) => ({
            ...c,
            from_unit_of_measure_id: Number(c.from_unit_of_measure_id),
            to_unit_of_measure_id: Number(c.to_unit_of_measure_id),
        })),
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!getToken()) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('order-date').min = addDays(1).toISOString().slice(0, 10);

    try {
        const data = await apiRequest('/orders/catalog', { auth: true });
        CATALOG = normalizeCatalog(data);

        loadDraft();

        renderAll();
        initEvents();
    } catch (error) {
        showAlert(error.message);
    }
});