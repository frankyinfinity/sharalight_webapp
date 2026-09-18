/**
 * Pagina "Nuovo Ordine" (ordine cliente) — stile app.
 *
 * Flusso:
 *  1. Scarica il catalogo da GET /api/orders/catalog.
 *  2. L'utente compone l'ordine TUTTO IN LOCALE (bozza in localStorage):
 *     - sceglie prodotti e quantità;
 *     - per ogni prodotto apre un pannello "ingredienti" con una lista di
 *       checkbox per categoria (scelta singola, come la select del backend)
 *       e sceglie la materia prima.
 *       I semi-lavorati mostrano le liste annidate.
 *  3. Il salvataggio finale invia UN UNICO JSON a POST /api/orders.
 *     Il backend crea l'ordine già nello stato "Prodotti Definiti".
 *
 * Nota: la bottom sheet viene SEMPRE aperta da zero (resetSheet()): nessun
 * residuo (titolo, quantità, gruppi ingredienti, pulsante) tra due aperture.
 * Anche l'elenco prodotti parte neutro: nessun prodotto è spuntato o
 * evidenziato per il solo fatto di essere già nel carrello, così lo stesso
 * prodotto può essere aggiunto più volte con ingredienti diversi.
 */

const DRAFT_KEY = 'shara_light_order_draft';
const MAX_DEPTH = 5;

// ---- Stato locale (bozza) ----
const state = {
    address: '',
    order_date: '',
    lat: null,       // coordinate dell'ultimo suggerimento scelto (null se manuale)
    lng: null,
    cart: [],        // { key, product_id, qnt, price, selections: { recipe_id: product_id } }
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

const fmtEur = (n) => fmt(round2(n), 2) + ' €';

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

/**
 * Sottotitolo compatto di un prodotto: categoria + unità di misura.
 * Sostituisce l'icona emoji della categoria, mantenendo l'informazione.
 */
function productMetaLabel(product) {
    const parts = [];
    if (product?.category_name) parts.push(product.category_name);
    if (product?.unit_of_measure_symbol) parts.push(product.unit_of_measure_symbol);
    return parts.join(' · ');
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
// Autocomplete indirizzi (via backend → provider Photon/OSM)
// ============================================================

const SUGGEST_MIN_CHARS = 4;  // la stessa soglia validata dal backend
const SUGGEST_DEBOUNCE_MS = 350;

let suggestAbort = null;   // AbortController della richiesta in corso
let suggestTimer = null;   // timer del debounce

/**
 * Chiama GET /api/geocode (il provider esterno è contattato solo dal
 * backend, che gestisce cache e fallback) e riempie la tendina dei
 * suggerimenti. Degradazione silenziosa: se l'API non risponde o non trova
 * nulla, la tendina resta chiusa e l'inserimento resta manuale.
 */
async function requestAddressSuggestions() {
    const query = document.getElementById('order-address').value.trim();

    hideAddressSuggestions();

    if (query.length < SUGGEST_MIN_CHARS) return;

    if (suggestAbort) suggestAbort.abort();
    if (suggestTimer) clearTimeout(suggestTimer);

    suggestTimer = setTimeout(async () => {
        suggestAbort = new AbortController();
        try {
            const data = await apiRequest(`/geocode?q=${encodeURIComponent(query)}&limit=5`, { auth: true, signal: suggestAbort.signal });
            const results = Array.isArray(data.results) ? data.results : [];
            if (results.length > 0) renderAddressSuggestions(results);
        } catch (error) {
            if (error.name !== 'AbortError') { /* servizio non disponibile: resta la digitazione manuale */ }
        }
    }, SUGGEST_DEBOUNCE_MS);
}

function renderAddressSuggestions(results) {
    const box = document.getElementById('address-suggest');
    box.innerHTML = results.map((r) => `
        <button type="button" class="addr-option" data-lat="${esc(r.lat)}" data-lng="${esc(r.lng)}">
            <span class="addr-option-label">${esc(r.label)}</span>
            ${r.city || r.country ? `<span class="addr-option-meta">${esc([r.postcode, r.city, r.country].filter(Boolean).join(', '))}</span>` : ''}
        </button>
    `).join('');
    box.hidden = false;
}

function hideAddressSuggestions() {
    const box = document.getElementById('address-suggest');
    if (box) box.hidden = true;
    if (suggestAbort) { suggestAbort.abort(); suggestAbort = null; }
    if (suggestTimer) { clearTimeout(suggestTimer); suggestTimer = null; }
}

/**
 * Sceglie un suggerimento: l'indirizzo diventa l'etichetta del provider e le
 * coordinate decimali vengono salvate in state (poi nel payload dell'ordine).
 */
function pickAddressSuggestion(event) {
    const option = event.target.closest('.addr-option');
    if (!option) return;

    const addressInput = document.getElementById('order-address');
    addressInput.value = option.querySelector('.addr-option-label').textContent;
    state.address = addressInput.value.trim();
    state.lat = Number(option.dataset.lat);
    state.lng = Number(option.dataset.lng);
    persistDraft();
    hideAddressSuggestions();
}

// ============================================================
// Persistenza bozza locale
// ============================================================

function persistDraft() {
    if (!localStorageAvailable()) return;
    const draft = {
        address: state.address,
        lat: state.lat,
        lng: state.lng,
        order_date: state.order_date,
        cart: state.cart.map((it) => ({ key: it.key, product_id: it.product_id, qnt: it.qnt, price: it.price ?? null, selections: { ...it.selections } })),
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
        const validCoordinates = Number.isFinite(draft.lat) && Math.abs(draft.lat) <= 90
            && Number.isFinite(draft.lng) && Math.abs(draft.lng) <= 180;
        state.lat = validCoordinates ? draft.lat : null;
        state.lng = validCoordinates ? draft.lng : null;
        state.order_date = draft.order_date || '';
        state.nextKey = draft.nextKey || 1;
        state.cart = (draft.cart || []).map((it) => {
            if (!productById(it.product_id)) return null;
            return { key: it.key, product_id: Number(it.product_id), qnt: Math.max(1, parseQnt(it.qnt) || 1), price: it.price ?? null, selections: { ...(it.selections || {}) } };
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
    const ingredients = ingredientNamesForItem(item);
    const ingredientsLine = ingredients.length
        ? `<span class="cart-item-ingredients">Ingredienti: ${esc(ingredients.join(', '))}</span>`
        : '';

    // Prezzo riga: (prezzo candela + ingredienti scelti) × quantità
    const qnt = parseQnt(item.qnt) || 0;
    const ingredientsTotal = ingredientsTotalForItem(item);
    const unitPrice = unitPriceForItem(item);
    let priceLine = '';

    if (unitPrice !== null) {
        const basePrice = round2(unitPrice - ingredientsTotal);
        const unitLabel = ingredientsTotal > 0
            ? `(${fmtEur(basePrice)} + ${fmtEur(ingredientsTotal)})`
            : fmtEur(basePrice);
        priceLine = `<span class="cart-item-price">${esc(unitLabel)} × ${esc(fmt(qnt))} = <strong>${esc(fmtEur(unitPrice * qnt))}</strong></span>`;
    }

    return `
        <article class="cart-item" data-key="${item.key}">
            <div class="cart-item-main" data-key="${item.key}">
                <div class="cart-item-info">
                    <span class="cart-item-name">${esc(product?.name || 'Prodotto')}</span>
                    <span class="cart-item-meta">${esc(productMetaLabel(product))}</span>
                    ${ingredientsLine}
                    ${priceLine}
                </div>
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
    const qntText = allPieces ? `${fmt(total, 2)} PZ` : fmt(total, 2);

    // Totale economico: somma di (prezzo candela + ingredienti scelti) × quantità
    const totalPrice = state.cart.reduce((sum, item) => {
        const unitPrice = unitPriceForItem(item);
        return unitPrice === null ? sum : sum + unitPrice * parseQnt(item.qnt);
    }, 0);

    const totalEl = document.getElementById('order-total');
    if (totalPrice > 0) {
        totalEl.textContent = fmtEur(totalPrice);
        document.getElementById('order-total-qnt').textContent = qntText;
        document.getElementById('order-total-qnt').classList.remove('hidden');
    } else {
        totalEl.textContent = qntText;
        document.getElementById('order-total-qnt').classList.add('hidden');
    }
}

function renderQuickDates() {
    document.querySelectorAll('.qd-chip').forEach((chip) => {
        const iso = addDays(Number(chip.dataset.days)).toISOString().slice(0, 10);
        chip.classList.toggle('active', state.order_date === iso);
    });
}

function addDays(days) { const d = new Date(); d.setDate(d.getDate() + days); return d; }

// ---- Sheet: vista 1 (elenco prodotti) ----

/**
 * Elenco prodotti della sheet (vista 1).
 *
 * TUTTI i prodotti sono resi allo stesso modo, sempre NON selezionati:
 * nessuna spunta "✓" né evidenziazione per i prodotti già presenti nel
 * carrello. Lo stesso prodotto può così essere aggiunto più volte con
 * ingredienti diversi, senza che la lista suggerisca una scelta già fatta.
 */
function renderSheetProductList() {
    const listEl = document.getElementById('product-sheet-list');

    listEl.innerHTML = orderableProducts().map((p) => {
        const priceLabel = (p.price !== null && p.price !== undefined)
            ? `<span class="sheet-item-price">${esc(fmtEur(Number(p.price)))}</span>`
            : '';

        return `
        <button type="button" class="sheet-item" data-product-id="${p.id}">
            <span class="sheet-item-body">
                <span class="sheet-item-name">${esc(p.name)}</span>
                <span class="sheet-item-meta">${esc(productMetaLabel(p))}</span>
                ${priceLabel}
            </span>
            <span class="sheet-item-add" aria-hidden="true">+</span>
        </button>
    `; }).join('');
}
// ---- Sheet: vista 2 (configurazione ingredienti) ----

/**
 * Mostra la vista 2 (ingredienti + quantità) per un prodotto.
 *
 * @param {number|string} productId
 * @param {object} [options]
 * @param {object} [options.selections] Scelte già presenti { recipe_id: product_id }
 * @param {number|string} [options.qnt] Quantità iniziale (default 1)
 * @param {number|string|null} [options.editKey] Key della riga di carrello da
 *        aggiornare (modalità modifica); null/assente = nuova riga
 */
function showProductConfig(productId, { selections = {}, qnt = 1, editKey = null } = {}) {
    configProductId = Number(productId);
    configSelections = { ...selections };

    const product = productById(productId);
    document.getElementById('sheet-config-title').textContent = product?.name || 'Prodotto';

    const qntInput = document.getElementById('sheet-qnt-input');
    const initialQnt = parseQnt(qnt);
    qntInput.value = initialQnt > 0 ? round2(initialQnt) : 1;

    renderIngredientConfig();   // ricrea i gruppi + aggiorna lo stato del pulsante

    const configEl = document.getElementById('sheet-view-config');
    const addBtn = document.getElementById('sheet-add-btn');
    if (editKey !== null && editKey !== undefined) {
        // Modalità modifica: "Conferma" aggiorna la riga esistente
        configEl.dataset.editKey = String(editKey);
        addBtn.textContent = '✓ Conferma';
    } else {
        delete configEl.dataset.editKey;
        addBtn.textContent = '+ Aggiungi al carrello';
    }

    const bodyEl = configEl.querySelector('.sheet-config-body');
    if (bodyEl) bodyEl.scrollTop = 0;

    document.getElementById('sheet-view-list').hidden = true;
    configEl.hidden = false;
}

/** Nuova configurazione dalla vista 1: nessuna selezione pregressa. */
function openProductConfig(productId) {
    showProductConfig(productId);
}

/**
 * Riporta la sheet allo stato iniziale: vista 1 con l'elenco prodotti e
 * nessun residuo della configurazione precedente (titolo, quantità, gruppi
 * ingredienti renderizzati, pulsante di conferma, modalità modifica,
 * posizione di scorrimento). Usata all'apertura della sheet e dal pulsante
 * "torna alla lista", così il pannello non riusa mai contenuti vecchi.
 */
function resetSheet() {
    configProductId = null;
    configSelections = {};

    const sheet = document.getElementById('product-sheet');
    const listView = document.getElementById('sheet-view-list');
    const configEl = document.getElementById('sheet-view-config');

    // Vista 2: azzera i residui della configurazione precedente
    document.getElementById('sheet-config-title').textContent = 'Prodotto';
    document.getElementById('sheet-qnt-input').value = 1;
    document.getElementById('sheet-ing-list').innerHTML = '';
    const priceLineEl = document.getElementById('sheet-price-line');
    if (priceLineEl) {
        priceLineEl.hidden = true;
        priceLineEl.innerHTML = '';
    }
    delete configEl.dataset.editKey;

    const addBtn = document.getElementById('sheet-add-btn');
    if (addBtn) {
        addBtn.textContent = '+ Aggiungi al carrello';
        addBtn.disabled = true;   // nessun gruppo renderizzato = niente da confermare
    }

    configEl.hidden = true;
    listView.hidden = false;
    renderSheetProductList();

    // Scorrimento in cima (sheet, viste e contenitori scorrevoli)
    sheet.scrollTop = 0;
    listView.scrollTop = 0;
    configEl.scrollTop = 0;
    const listEl = document.getElementById('product-sheet-list');
    if (listEl) listEl.scrollTop = 0;
    const bodyEl = configEl.querySelector('.sheet-config-body');
    if (bodyEl) bodyEl.scrollTop = 0;
}

/**
 * Renderizza i gruppi "ingrediente" (una lista di checkbox per categoria) in
 * modo ricorsivo: se la materia prima scelta è un semi-lavorato, mostra le
 * liste annidate per le sue ricette.
 */
function renderIngredientConfig() {
    const listEl = document.getElementById('sheet-ing-list');
    listEl.innerHTML = ingredientRowsHtml(configProductId, [configProductId], 0);
    updateAddButtonState();
    renderSheetPrice();
}

/**
 * Somma dei prezzi delle materie prime scelte nella configurazione corrente
 * (solo prodotti senza ricetta, come nel riepilogo "Ingredienti" del carrello).
 */
function configIngredientsTotal() {
    // Le selezioni correnti si leggono dal DOM: così vengono conteggiati anche
    // gli ingredienti preselezionati di default (mostrati come spuntati).
    const selections = collectConfigSelections();
    const seen = new Set();
    let total = 0;

    Object.values(selections).forEach((productId) => {
        const product = productById(productId);
        if (!product || hasRecipe(product)) return;
        if (seen.has(product.id)) return;
        seen.add(product.id);

        if (product.price !== null && product.price !== undefined) {
            total += Number(product.price);
        }
    });

    return round2(total);
}

/**
 * Riga prezzo della configurazione:
 * (prezzo candela + ingredienti scelti) × quantità.
 */
function renderSheetPrice() {
    const el = document.getElementById('sheet-price-line');
    if (!el) return;

    const product = configProductId !== null ? productById(configProductId) : null;
    const basePrice = product?.price ?? null;
    const ingredientsTotal = configIngredientsTotal();
    const qnt = parseQnt(document.getElementById('sheet-qnt-input').value) || 0;

    if ((basePrice === null || basePrice === undefined) && ingredientsTotal <= 0) {
        el.hidden = true;
        el.innerHTML = '';
        return;
    }

    const unitPrice = round2(Number(basePrice || 0) + ingredientsTotal);
    const unitLabel = ingredientsTotal > 0
        ? `(${fmtEur(Number(basePrice || 0))} + ${fmtEur(ingredientsTotal)})`
        : fmtEur(unitPrice);

    el.hidden = false;
    el.innerHTML = `${esc(unitLabel)} × ${esc(fmt(qnt))} = <strong>${esc(fmtEur(unitPrice * qnt))}</strong>`;
}

/**
 * Abilita il pulsante "Aggiungi al carrello" solo se OGNI categoria
 * (incluso l'annidamento semi-lavorato) ha una materia prima spuntata.
 */
function updateAddButtonState() {
    const btn = document.getElementById('sheet-add-btn');
    if (!btn) return;

    const groups = document.querySelectorAll('#sheet-ing-list .ing-row[data-recipe-id]');
    const allSelected = groups.length > 0
        && Array.from(groups).every((group) => group.querySelector('.ing-check:checked') !== null);

    btn.disabled = !allSelected;
}


function ingredientRowsHtml(productId, excluded, depth) {
    if (depth > MAX_DEPTH) return '';

    return recipesByProduct(productId).map((recipe) => {
        const selectedId = selectedIngredientForRecipe(recipe, excluded);
        const available = productsByCategory(recipe.product_category_id)
            .filter((p) => !excluded.includes(p.id))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const titleId = `ing-cat-${recipe.id}`;
        const options = available.length
            ? available.map((p) => ingredientOptionHtml(recipe, p, selectedId)).join('')
            : '<p class="ing-empty">Nessuna materia prima disponibile</p>';

        const selectedProduct = productById(selectedId);
        let nested = '';
        if (selectedProduct && hasRecipe(selectedProduct)) {
            nested = `<div class="ing-nested">${ingredientRowsHtml(selectedProduct.id, [...excluded, selectedProduct.id], depth + 1)}</div>`;
        }

        return `
            <div class="ing-row" data-depth="${depth}" data-recipe-id="${recipe.id}">
                <div class="ing-row-top">
                    <span class="ing-cat" id="${titleId}">${esc(recipe.category_name)}</span>
                    <span class="ing-cat-count">${available.length === 1 ? '1 opzione' : `${available.length} opzioni`}</span>
                </div>
                <div class="ing-options" role="group" aria-labelledby="${titleId}">
                    ${options}
                </div>
                ${nested}
            </div>
        `;
    }).join('');
}

/**
 * Una voce della lista ingredienti: checkbox (stilizzata in CSS) + nome della
 * materia prima + prezzo fisso di listino. Il prezzo mostrato è quello del
 * prodotto selezionato: entra nel prezzo unitario della riga come
 * (prezzo candela + prezzo ingredienti scelti), poi moltiplicato per la
 * quantità. La scelta è singola per categoria, come nella select usata in
 * precedenza: la lista viene ri-renderizzata a ogni cambiamento, quindi resta
 * spuntata solo la scelta corrente (o il default automatico della ricetta).
 */
function ingredientOptionHtml(recipe, product, selectedId) {
    const checked = Number(selectedId) === Number(product.id);
    const priceLabel = (product.price !== null && product.price !== undefined)
        ? `<span class="ing-option-price">${esc(fmtEur(Number(product.price)))}</span>`
        : '';

    return `
        <label class="ing-option ${checked ? 'selected' : ''}">
            <input type="checkbox" class="ing-check" data-recipe-id="${recipe.id}" value="${product.id}" ${checked ? 'checked' : ''}>
            <span class="ing-option-name">${esc(product.name)}</span>
            ${priceLabel}
        </label>
    `;
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
 * Raccoglie le scelte utente dalla vista config (una checkbox spuntata per
 * categoria).
 */
function collectConfigSelections() {
    const result = {};
    document.querySelectorAll('#sheet-ing-list .ing-check:checked').forEach((check) => {
        result[Number(check.dataset.recipeId)] = Number(check.value);
    });
    return result;
}

function addConfiguredProductToCart() {
    const qnt = parseQnt(document.getElementById('sheet-qnt-input').value);
    const finalQnt = round2(qnt > 0 ? qnt : 1);
    const selections = collectConfigSelections();
    const configEl = document.getElementById('sheet-view-config');
    const editKey = configEl.dataset.editKey ? Number(configEl.dataset.editKey) : null;

    if (editKey !== null && editKey !== undefined) {
        // Modalità modifica: aggiorna la riga esistente
        const existing = itemByKey(editKey);
        if (existing) {
            existing.qnt = finalQnt;
            existing.selections = selections;
        }
    } else {
        // Modalità nuovo: aggiunge una riga al carrello
        state.cart.push({
            key: state.nextKey++,
            product_id: configProductId,
            qnt: finalQnt,
            price: productById(configProductId)?.price ?? null,
            selections,
        });
    }

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

/**
 * Riapre il pannello configurazione ingredienti per modificare una riga
 * già presente nel carrello. La sheet viene aperta pulita e poi portata
 * sulla vista ingredienti con le selezioni e la quantità salvate, così
 * l'utente può variare le materie prime. Al confermare la riga viene
 * aggiornata (non duplicata).
 */
function editCartItem(key) {
    const item = itemByKey(key);
    if (!item) return;

    // 1) Apre la sheet con stato pulito (vista 1)...
    openSheet();
    // 2) ...poi mostra la configurazione della riga, in modalità modifica
    showProductConfig(item.product_id, {
        selections: item.selections,
        qnt: item.qnt,
        editKey: key,
    });
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

/**
 * Restituisce i nomi delle materie prime "foglia" (prodotti senza ricetta)
 * che compongono un prodotto, risolti a partire dalle selezioni indicate
 * (se assenti usa il default automatico). Utile per mostrare in carrello
 * un riepilogo leggibile degli ingredienti sceltti.
 */
function resolveIngredientNames(productId, userSelections, excluded, depth, acc) {
    if (depth > MAX_DEPTH) return;

    for (const recipe of recipesByProduct(productId)) {
        let selectedProductId = null;

        if (userSelections && userSelections[recipe.id] !== undefined) {
            selectedProductId = Number(userSelections[recipe.id]);
        } else {
            selectedProductId = autoSelectForRecipe(recipe, excluded);
        }

        if (!selectedProductId) continue;

        const selectedProduct = productById(selectedProductId);

        if (selectedProduct && hasRecipe(selectedProduct)) {
            resolveIngredientNames(selectedProduct.id, userSelections, [...excluded, selectedProduct.id], depth + 1, acc);
        } else if (selectedProduct) {
            if (!acc.includes(selectedProduct.name)) {
                // Prezzo fisso di listino dell'ingrediente, mostrato com'è
                // (nessuna moltiplicazione per quantità)
                const priceLabel = (selectedProduct.price !== null && selectedProduct.price !== undefined)
                    ? ` (${fmtEur(Number(selectedProduct.price))})`
                    : '';
                acc.push(selectedProduct.name + priceLabel);
            }
        }
    }
}

function ingredientNamesForItem(item) {
    const acc = [];
    resolveIngredientNames(item.product_id, item.selections || {}, [Number(item.product_id)], 0, acc);
    return acc;
}

/**
 * Somma dei prezzi degli ingredienti scelti per una riga di carrello.
 * Considera solo le materie prime (prodotti senza ricetta), cioè le stesse
 * voci mostrate nel riepilogo "Ingredienti": così i semi-lavorati e i loro
 * componenti non vengono conteggiati due volte.
 */
function ingredientsTotalForItem(item) {
    const seen = new Set();
    let total = 0;

    collectSelections(item).forEach((detail) => {
        const product = productById(detail.product_id);
        if (!product || hasRecipe(product)) return;
        if (seen.has(product.id)) return;
        seen.add(product.id);

        if (product.price !== null && product.price !== undefined) {
            total += Number(product.price);
        }
    });

    return round2(total);
}

/**
 * Prezzo unitario di una riga: prezzo candela + prezzo ingredienti scelti.
 * Restituisce null se né il prodotto né gli ingredienti hanno un prezzo.
 */
function unitPriceForItem(item) {
    const product = productById(item.product_id);
    const basePrice = item.price ?? product?.price ?? null;
    const ingredientsTotal = ingredientsTotalForItem(item);

    if ((basePrice === null || basePrice === undefined) && ingredientsTotal <= 0) return null;

    return round2(Number(basePrice || 0) + ingredientsTotal);
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
        lat: address === state.address.trim() ? state.lat : null,
        lng: address === state.address.trim() ? state.lng : null,
        order_date: orderDate,
        products: state.cart.map((item) => {
            const product = productById(item.product_id);
            const price = item.price ?? product?.price ?? null;
            return {
                product_id: item.product_id,
                qnt: round2(parseQnt(item.qnt)),
                unit_of_measure_id: product?.unit_of_measure_id,
                price: price !== null && price !== undefined ? round2(Number(price)) : null,
                details: collectSelections(item).map((d) => {
                    const detailProduct = productById(d.product_id);
                    const detailPrice = detailProduct?.price ?? null;
                    return { ...d, price: detailPrice !== null && detailPrice !== undefined ? round2(Number(detailPrice)) : null };
                }),
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

/**
 * Apre la bottom sheet. Chiama sempre resetSheet(): il pannello che esce
 * parte da zero (vista elenco prodotti), senza residui dell'apertura
 * precedente.
 */
function openSheet() {
    resetSheet();
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
        renderSheetPrice();
    });
    document.getElementById('sheet-qnt-plus').addEventListener('click', () => {
        const input = document.getElementById('sheet-qnt-input');
        input.value = round2(parseQnt(input.value) + 1);
        renderSheetPrice();
    });
    document.getElementById('sheet-qnt-input').addEventListener('change', (event) => {
        const v = parseQnt(event.target.value);
        event.target.value = round2(v > 0 ? v : 1);
        renderSheetPrice();
    });

    // Vista 2: spunta/rimuove una materia prima → aggiorna gli annidamenti
    document.getElementById('sheet-ing-list').addEventListener('change', (event) => {
        const check = event.target.closest('.ing-check');
        if (!check) return;

        const row = check.closest('.ing-row');
        const recipeId = Number(row.dataset.recipeId);

        if (check.checked) {
            // Scelta singola per categoria: la selezione precedente viene sostituita
            configSelections[recipeId] = Number(check.value);
        } else if (configSelections[recipeId] === undefined) {
            // La scelta è obbligatoria: il "deseleziona" conferma la voce corrente
            configSelections[recipeId] = Number(check.value);
        }

        renderIngredientConfig(); // ricrea le liste annidate + aggiorna stato pulsante
    });

    // Vista 2: torna indietro (sheet ripulita) / aggiungi al carrello
    document.getElementById('sheet-back-btn').addEventListener('click', resetSheet);
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

        // Click sulla riga (non su stepper/rimuovi) → modifica ingredienti
        const main = event.target.closest('.cart-item-main');
        if (main) editCartItem(main.dataset.key);
    });
    cart.addEventListener('change', (event) => {
        if (event.target.classList.contains('step-value')) commitQty(event.target);
    });

    // Dati consegna
    document.getElementById('order-address').addEventListener('input', (event) => {
        state.address = event.target.value;
        // L'indirizzo è stato modificato: le coordinate precedenti non sono più
        // affidabili finché l'utente non sceglie di nuovo un suggerimento
        state.lat = null;
        state.lng = null;
        requestAddressSuggestions();
        persistDraft();
    });
    document.getElementById('order-address').addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hideAddressSuggestions();
    });
    document.getElementById('address-suggest').addEventListener('mousedown', pickAddressSuggestion);
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.input-icon')) hideAddressSuggestions();
    });
    window.addEventListener('blur', hideAddressSuggestions);
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