# Shara Light — Webapp

Webapp frontend (HTML/CSS/JS puro, nessuna build necessaria) collegata alle API
del backend Laravel presente in `../backend`.

## Pagine

| Pagina           | File               | Descrizione                                     |
|------------------|--------------------|-------------------------------------------------|
| Login            | `index.html`       | Accesso con email e password                    |
| Registrazione    | `register.html`    | Creazione account (nome, cognome, email, password) |
| Home (riservata) | `home.html`        | Benvenuto + griglia **Moduli** (ciascun modulo è una tessera; per aggiungerne di nuovi estendi `MODULES` in `js/home.js`) |
| Ordini           | `orders.html`      | Elenco degli ordini dell'utente con badge di stato "cliente" + pulsante "Nuovo Ordine" |
| Nuovo Ordine     | `order-new.html`   | Creazione ordine in stile app: prodotti, quantità e scelta delle materie prime (una per categoria, tramite **lista con checkbox**). Bozza in `localStorage`, invio di un unico JSON |

## API utilizzate (backend Laravel, autenticazione Sanctum token)

| Metodo | Endpoint            | Descrizione                          | Auth        |
|--------|---------------------|--------------------------------------|-------------|
| POST   | `/api/register`     | Registrazione, restituisce il token  | No          |
| POST   | `/api/login`        | Login, restituisce il token          | No          |
| GET    | `/api/user`         | Dati dell'utente autenticato         | Bearer token|
| POST   | `/api/logout`       | Logout (revoca il token)             | Bearer token|
| GET    | `/api/orders`       | Ordini cliente dell'utente autenticato | Bearer token|
| GET    | `/api/orders/catalog` | Catalogo per comporre un ordine (prodotti, ricette, U.M., conversioni) | Bearer token|
| POST   | `/api/orders`       | Crea un ordine cliente completo da un **unico JSON**. L'ordine viene creato già nello stato **"Prodotti Definiti"** | Bearer token|

Il token è salvato in `localStorage` (chiave `shara_light_token`) e inviato
nell'header `Authorization: Bearer <token>`.

### Stati dell'ordine mostrati al cliente

La webapp traduce gli stati "interni" del backend in 3 stati più semplici
(un solo colore di badge per gruppo), definiti in `STATE_LABELS` /
`STATE_CLASSES` in `js/orders.js`:

| Stato backend      | Badge mostrato nella webapp | Classe CSS          |
|--------------------|-----------------------------|---------------------|
| `created`          | **In lavorazione**          | `badge-in-progress` |
| `products_defined` | **In lavorazione**          | `badge-in-progress` |
| `products_allocated` | **In lavorazione**        | `badge-in-progress` |
| `in_shipment`      | **In spedizione**           | `badge-in-shipment` |
| `shipped`          | **Spedito**                 | `badge-shipped`     |

L'etichetta interna ricevuta dall'API (`state_label`: "Creato", "Prodotti
Definiti", …) resta disponibile come **tooltip** sul badge (attributo `title`).
Gli stati interni nel pannello di amministrazione Laravel non sono modificati.

### Creazione ordine (modulo Ordini)

1. Da **Home** → modulo **Ordini** si vede l'elenco degli ordini già fatti.
2. **"Nuovo Ordine"** apre una pagina in stile app con due passi:
   - **Dati di consegna**: indirizzo **con autocomplete** e data (con
     scorciatoie "Domani", "Tra 3 giorni", "Tra 7 giorni"). Digitando almeno
     4 caratteri appaiono i suggerimenti di indirizzo (`GET /api/geocode`);
     scegliendone uno, oltre all'indirizzo vengono salvate le **coordinate**
     (lat/lng) e inviate con l'ordine. Se si riscrive l'indirizzo a mano le
     coordinate vengono azzerate (inviate solo se coerenti con l'indirizzo).
     Il servizio è **gratuito e senza chiave**: il backend interroga
     **Photon** (geocoder open source su dati **OpenStreetMap**,
     `photon.komoot.io`), che a differenza di Nominatim **consente
     esplicitamente il search-as-you-type**; risposte in cache 24h e
     degradazione silenziosa (inserimento manuale) se il servizio non è
     raggiungibile. Dati © OpenStreetMap (ODbL).
   - **I tuoi prodotti**: si aggiungono i prodotti dal carrello (bottom
     sheet), con stepper per la quantità. La sheet si apre **sempre da
     zero**: elenco prodotti in cima e nessun residuo (titolo, quantità,
     ingredienti, stato del pulsante) della configurazione precedente.
     Nell'elenco **nessun prodotto è spuntato o evidenziato** per il solo
     fatto di essere già nel carrello: i prodotti sono tutti non selezionati,
     quindi lo stesso prodotto può essere aggiunto più volte con ingredienti
     diversi.
3. Per ogni prodotto si aprono gli **ingredienti**: una **lista con checkbox**
   per ogni categoria (scelta singola, come la select del backend). La materia
   prima è preselezionata in automatico (prodotto abilitato nella ricetta
   oppure primo disponibile della categoria); se la materia prima scelta è un
   **semi-lavorato**, vengono mostrate le liste annidate delle sue ricette.
4. Al salvataggio la webapp calcola le quantità derivate (inclusi i
   semi-lavorati annidati e le conversioni U.M.).
5. Tutta la composizione avviene **in locale** (bozza salvata in
   `localStorage`, chiave `shara_light_order_draft`): nessuna chiamata
   intermedia al server (fuorché l'autocomplete degli indirizzi, che passa
   dal backend).
6. Al salvataggio viene inviato **un unico JSON** a `POST /api/orders`
   (dati consegna + coordinate opzionali `lat`/`lng` + prodotti + dettagli
   ingredienti calcolati). Il backend
   crea l'ordine direttamente nello stato **`products_defined`**
   ("Prodotti Definiti").

## Avvio

### Modo rapido (consigliato)

Doppio click su **`backend\start.bat`** (oppure eseguilo da un terminale):
avvia in due finestre separate il backend Laravel e la webapp, poi apre
automaticamente il browser sulla pagina di login.

Chiudi le due finestre per fermare i server.

### Manuale (due terminali)

1. **Backend** (terminale 1):

   ```bash
   cd ../backend
   php artisan serve
   ```

   → http://localhost:8000

2. **Webapp** (terminale 2):

   ```bash
   php -S localhost:3000
   ```

   → apri http://localhost:3000/index.html

   In alternativa è sufficiente aprire `index.html` direttamente nel browser.

## Configurazione

Se il backend gira su un indirizzo diverso, modifica la costante
`API_BASE_URL` in `js/api.js`.
