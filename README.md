# Shara Light — Webapp

Webapp frontend (HTML/CSS/JS puro, nessuna build necessaria) collegata alle API
del backend Laravel presente in `../backend`.

## Pagine

| Pagina           | File               | Descrizione                                     |
|------------------|--------------------|-------------------------------------------------|
| Login            | `index.html`       | Accesso con email e password                    |
| Registrazione    | `register.html`    | Creazione account (nome, cognome, email, password) |
| Home (riservata) | `home.html`        | Benvenuto + griglia **Moduli** (ciascun modulo è una tessera; per aggiungerne di nuovi estendi `MODULES` in `js/home.js`) |
| Ordini           | `orders.html`      | Elenco degli ordini dell'utente + pulsante "Nuovo Ordine" |
| Nuovo Ordine     | `order-new.html`   | Creazione ordine in stile app: si scelgono solo prodotti e quantità; gli ingredienti sono calcolati in automatico al salvataggio. Bozza in `localStorage`, invio di un unico JSON |

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

### Creazione ordine (modulo Ordini)

1. Da **Home** → modulo **Ordini** si vede l'elenco degli ordini già fatti.
2. **"Nuovo Ordine"** apre una pagina in stile app con due passi:
   - **Dati di consegna**: indirizzo e data (con scorciatoie "Domani",
     "Tra 3 giorni", "Tra 7 giorni");
   - **I tuoi prodotti**: si aggiungono i prodotti dal carrello (bottom
     sheet), con stepper per la quantità.
3. Al cliente non vengono chiesti gli ingredienti: al salvataggio la webapp
   **calcola automaticamente** per ogni ricetta il prodotto di default e le
   quantità derivate (inclusi i semi-lavorati annidati e le conversioni U.M.).
4. Tutta la composizione avviene **in locale** (bozza salvata in
   `localStorage`, chiave `shara_light_order_draft`): nessuna chiamata
   intermedia al server.
5. Al salvataggio viene inviato **un unico JSON** a `POST /api/orders`
   (dati consegna + prodotti + dettagli ingredienti calcolati). Il backend
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
