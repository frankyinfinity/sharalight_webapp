# Shara Light — Webapp

Webapp frontend (HTML/CSS/JS puro, nessuna build necessaria) collegata alle API
del backend Laravel presente in `../backend`.

## Pagine

| Pagina           | File            | Descrizione                                  |
|------------------|-----------------|----------------------------------------------|
| Login            | `index.html`    | Accesso con email e password                 |
| Registrazione    | `register.html` | Creazione account (nome, cognome, email, password) |
| Home (riservata) | `home.html`     | "Benvenuto {nome} {cognome}" + pulsante Logout |

## API utilizzate (backend Laravel, autenticazione Sanctum token)

| Metodo | Endpoint        | Descrizione                          | Auth        |
|--------|-----------------|--------------------------------------|-------------|
| POST   | `/api/register` | Registrazione, restituisce il token  | No          |
| POST   | `/api/login`    | Login, restituisce il token          | No          |
| GET    | `/api/user`     | Dati dell'utente autenticato         | Bearer token|
| POST   | `/api/logout`   | Logout (revoca il token)             | Bearer token|

Il token è salvato in `localStorage` (chiave `shara_light_token`) e inviato
nell'header `Authorization: Bearer <token>`.

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
