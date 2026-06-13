# Setup cloud — The Grape Escape

## Fase 1 — Crea il progetto Supabase (≈5 min)

1. Vai su **https://supabase.com** → **Start your project** → accedi con Google (silvia.greco@gmail.com) o email.
2. **New project**:
   - Name: `grape-escape`
   - Database Password: scegline una e **salvala** (non serve a Claude, serve a te per il DB)
   - Region: **West EU (Ireland)** o **Central EU (Frankfurt)**
   - Plan: **Free**
3. Aspetta ~2 min che il progetto si crei.
4. Apri **SQL Editor** (icona a sinistra) → **New query** → incolla tutto il contenuto di `schema.sql` → **Run**. Deve dire *Success*.
5. Vai su **Project Settings → API** e copia:
   - **Project URL** (es. `https://xxxx.supabase.co`)
   - **anon public** key (la chiave lunga sotto "Project API keys")

> La chiave **anon public** è pensata per stare nel front-end: è sicura da incollare nell'app (i dati restano protetti dalle policy di sicurezza). NON copiare mai la chiave *service_role*.

6. Manda a Claude **Project URL** + **anon public key**: collego l'app.

## Fase 2 — Login + sync

### 2a. Mostra il codice nell'email di login (1 min, importante)
Di default l'email di accesso contiene solo un link, non il codice. Per usare il codice:
1. Supabase → **Authentication** → **Emails** (o **Email Templates**) → scheda **Magic Link**
2. Assicurati che nel testo ci sia il token. Aggiungi questa riga se manca:
   ```
   <p>Il tuo codice di accesso: <b>{{ .Token }}</b></p>
   ```
3. **Save**

### 2b. Test del login
1. Apri `index.html` (doppio clic).
2. Vedi la schermata di login → email già compilata → **Invia codice**.
3. Controlla la mail, copia il **codice** → incollalo → **Entra**.
4. Al primo accesso l'app carica nel cloud i task attuali. Da lì in poi sono sincronizzati.

## Fase 3 — Notifiche calendario (lo fa Claude)
## Fase 4 — Pubblicazione (lo fa Claude)
