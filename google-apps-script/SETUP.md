# Come collegare Gmail all'app — Istruzioni passo per passo

Questo programma legge le email di Airbnb, Booking e Kross e aggiorna l'app da solo.
**È completamente gratis** — usa solo strumenti Google e quelli che hai già.

Ci vogliono circa 15 minuti per fare tutto.

---

## PARTE 1 — Trovare la tua chiave segreta del database (Supabase)

1. Vai su **https://supabase.com/dashboard** e fai login
2. Clicca sul tuo progetto (si chiama qualcosa come "grape-escape" o "fiscal-app")
3. Nel menu a sinistra clicca su **Settings** (l'ingranaggio in basso)
4. Clicca su **API**
5. Scendi fino a vedere **Project API keys**
6. Copia il valore accanto a **service_role** (clicca sull'occhio per vederlo, poi copia)
   - Inizia con `eyJ...`
   - ⚠️ Questa chiave è segreta, non condividerla con nessuno

Tienila da parte — ti serve al Passo 4.

---

## PARTE 2 — Trovare il tuo codice utente (User ID)

1. Sei ancora su Supabase → clicca su **Authentication** nel menu a sinistra
2. Clicca su **Users**
3. Trovi una riga con `silvia.greco@gmail.com`
4. Nella colonna **UID** c'è un codice lungo tipo `a1b2c3d4-1234-...`
5. Copialo

Tienilo da parte — ti serve al Passo 4.

---

## PARTE 3 — Aggiungere una parola segreta a Netlify

Questo serve per far comunicare Gmail e le notifiche in modo sicuro.

1. Vai su **https://app.netlify.com** e fai login
2. Clicca sul tuo sito (The Grape Escape)
3. Clicca su **Site configuration** in alto
4. Nel menu a sinistra clicca su **Environment variables**
5. Clicca su **Add a variable**
6. Scrivi esattamente:
   - **Key:** `PUSH_SECRET`
   - **Value:** inventati una parola segreta qualunque, es. `grape2026segreto!`
7. Clicca **Save**
8. Ora vai su **Deploys** (in alto) e clicca **Trigger deploy → Deploy site** per rendere attiva la modifica

Annota la parola segreta che hai scelto — ti serve al Passo 4.

---

## PARTE 4 — Creare il programma su Google

1. Vai su **https://script.google.com** (usa il tuo account Gmail silvia.greco@gmail.com)
2. Clicca **Nuovo progetto** (in alto a sinistra)
3. In alto dove dice "Progetto senza titolo" clicca e rinomina in `Grape Escape - Gmail`
4. Vedi un riquadro con scritto `function myFunction() { }` — **seleziona tutto** (Ctrl+A) e **cancella**
5. Apri il file `google-apps-script/Code.gs` che ho preparato per te e **copia tutto il contenuto**
6. **Incolla** nel riquadro vuoto su Google
7. Salva con **Ctrl+S**

---

## PARTE 5 — Inserire i codici segreti nel programma

1. Sei ancora su script.google.com con il tuo progetto aperto
2. Clicca sull'**ingranaggio** ⚙️ a sinistra (Impostazioni progetto)
3. Scendi fino a **Proprietà script** e clicca **Modifica proprietà script**
4. Clicca **Aggiungi proprietà** per ognuna di queste righe:

| Nome proprietà     | Valore da inserire                                           |
|--------------------|--------------------------------------------------------------|
| `SUPABASE_URL`     | `https://vjurwiqeiummanltsdtt.supabase.co`                   |
| `SUPABASE_KEY`     | la chiave `service_role` copiata al Passo 1                  |
| `SUPABASE_USER_ID` | il tuo codice utente copiato al Passo 2                      |
| `PUSH_URL`         | `https://thegrapeescape.netlify.app/.netlify/functions/send-push` |
| `PUSH_SECRET`      | la parola segreta che hai scelto al Passo 3                  |

5. Clicca **Salva proprietà script**

---

## PARTE 6 — Avviare il programma (si fa solo una volta)

### Prima azione: attiva il controllo automatico

1. In alto, dove c'è un menu a tendina che dice "myFunction", cliccaci sopra
2. Seleziona **`impostaTrigger`**
3. Clicca il pulsante ▶ **Esegui**
4. La prima volta ti chiede di autorizzare l'accesso a Gmail:
   - Clicca **Rivedi autorizzazioni**
   - Scegli il tuo account Gmail
   - Clicca **Avanzate** (in basso a sinistra)
   - Clicca **Vai a Grape Escape - Gmail (non sicuro)**
   - Clicca **Consenti**
5. Aspetta qualche secondo. In basso dovresti vedere: `✅ Fatto! Il programma controllerà le email ogni 5 minuti.`

### Seconda azione: recupera le email passate

1. Dal menu a tendina seleziona **`recuperaEmailPassate`**
2. Clicca ▶ **Esegui**
3. Aspetta 2-3 minuti (sta leggendo tutte le email vecchie)
4. In basso dovresti vedere: `✅ Fatto! Tutte le email vecchie sono state elaborate.`

**Da questo momento il programma gira da solo.** Non devi fare altro.

---

## Come capire se funziona

- Le email elaborate ricevono un'etichetta Gmail chiamata **`grape-escape/elaborata`**
- Se qualcosa va storto, l'etichetta è **`grape-escape/errore`**
- Per vedere i messaggi del programma: clicca su **Esecuzioni** nel menu a sinistra di script.google.com

---

## Cosa fa il programma per ogni tipo di email

| Email che arriva                          | Cosa crea nell'app                                 |
|-------------------------------------------|----------------------------------------------------|
| Prenotazione Airbnb — Ciucarina o Balenga | Scontrino + Alloggiati (il giorno del check-in)   |
| Prenotazione Airbnb — case PM             | Fattura al proprietario (check-in + 12 giorni)    |
| Prenotazione Booking/Kross — case PM      | Fattura al proprietario (3° mese dopo + 12 giorni)|
| Cancellazione qualsiasi                   | Segna i task come annullati                        |
| Fattura IVA Airbnb (commissioni)          | Autofattura TD17 entro il 15 del mese              |

---

## Qualcosa non va? Controlla queste cose

**Non vedo nuovi task nell'app**
→ Vai su script.google.com → Esecuzioni → guarda se ci sono errori in rosso

**Il programma dice "nome annuncio non riconosciuto"**
→ Il nome dell'annuncio su Airbnb/Booking è scritto in modo diverso da come l'ho impostato — mandami screenshot e aggiungo la variante

**Task doppi**
→ Il programma usa codici univoci per non creare duplicati, ma se succede cancella il doppione dall'app
