# Setup Gmail Processor — The Grape Escape

## Cosa fa
Ogni 5 minuti controlla Gmail per email da Airbnb, Booking e Kross.
Per ogni prenotazione, modifica o cancellazione crea automaticamente i task nell'app e manda una notifica push.

---

## PASSO 1 — Aggiungi variabile PUSH_SECRET a Netlify

1. Vai su https://app.netlify.com → il tuo sito → Site configuration → Environment variables
2. Clicca **Add a variable**
3. Key: `PUSH_SECRET`  Value: una stringa casuale lunga almeno 20 caratteri, es. `grape2026secretPush!`
4. Salva e fai redeploy (o aspetta il prossimo push)

---

## PASSO 2 — Trova il tuo User ID su Supabase

1. Vai su https://supabase.com/dashboard → il tuo progetto
2. Vai su **Authentication → Users**
3. Trova la riga con `silvia.greco@gmail.com`
4. Copia l'UUID nella colonna **UID** (es. `a1b2c3d4-...`)

---

## PASSO 3 — Ottieni una chiave API Anthropic (per il parsing intelligente)

1. Vai su https://console.anthropic.com
2. Crea un account (se non l'hai) → aggiungi un metodo di pagamento
3. Vai su **API Keys → Create Key**
4. Copia la chiave (inizia con `sk-ant-...`)
5. Costo stimato: meno di €0,50/mese

> Opzionale: se salti questo passo il sistema funziona lo stesso ma con parsing semplificato (solo i casi più comuni).

---

## PASSO 4 — Crea il Google Apps Script

1. Vai su https://script.google.com
2. Clicca **Nuovo progetto**
3. Rinomina il progetto in `Grape Escape - Gmail`
4. Cancella tutto il codice nel file `Codice.gs`
5. Incolla il contenuto di `Code.gs` (questo file è in `google-apps-script/Code.gs`)
6. Salva (Ctrl+S)

---

## PASSO 5 — Imposta le Proprietà script

1. Nel progetto GAS: **Progetto → Impostazioni progetto → Proprietà script**
2. Aggiungi queste proprietà (una per riga):

| Proprietà | Valore |
|---|---|
| `SUPABASE_URL` | `https://vjurwiqeiummanltsdtt.supabase.co` |
| `SUPABASE_SERVICE_KEY` | la chiave service_role di Supabase |
| `SUPABASE_USER_ID` | il tuo UUID da Passo 2 |
| `CLAUDE_API_KEY` | la chiave Anthropic da Passo 3 (o lascia vuoto) |
| `PUSH_ENDPOINT` | `https://thegrapeescape.netlify.app/.netlify/functions/send-push` |
| `PUSH_SECRET` | la stessa stringa del Passo 1 |

---

## PASSO 6 — Prima esecuzione

Nel progetto GAS, in alto a sinistra seleziona la funzione e clicca ▶ **Esegui**:

1. Seleziona `setupTrigger` → Esegui  
   _(autorizza l'accesso a Gmail quando richiesto)_
2. Seleziona `backfillEmails` → Esegui  
   _(elabora tutte le email storiche, può richiedere 2-5 minuti)_

Da quel momento il trigger gira automaticamente ogni 5 minuti.

---

## Come funziona

| Email | Task creati |
|---|---|
| Airbnb prenotazione — casa tua (Ciucarina, Balenga) | 🧾 Scontrino + 🏛 Alloggiati |
| Airbnb prenotazione — case PM | 💶 Fattura (scadenza = check-in + 12 gg) |
| Booking/Kross prenotazione — case PM | 💶 Fattura (scadenza = payout mese dopo + 12 gg) |
| Airbnb pagamento co-host | Aggiorna importo sulla fattura esistente |
| Qualsiasi cancellazione | Segna i task come annullati |
| Fattura IVA Airbnb | 📄 Autofattura TD17 |

---

## Troubleshooting

- **Le email non vengono elaborate**: controlla i log GAS (Visualizza → Log) per errori
- **Task duplicati**: il sistema usa ID deterministici, difficile che succeda; se succede cancella il doppio dall'app
- **Mapping listing sconosciuto**: il log mostra `⚠ Unknown listing: [nome]` — comunicamelo per aggiungerlo
- **Label Gmail**: le email elaborate vengono archiviate con la label `grape-escape/ok`; quelle con errori con `grape-escape/errore`
