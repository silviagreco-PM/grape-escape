# 🔒 DESIGN BLOCCATO — card task (deciso con Silvia, NON cambiare senza ok)

Questa è la fonte di verità del design della card. Ogni modifica deve rispettarla.
Se qualcosa qui è in conflitto con un'idea nuova → chiedere PRIMA di toccare.

## Struttura della card (uguale per TUTTI i task)
1. **Fuori dal bordo, piccolo**: "Aggiunto il <data> · <ora>".
2. **Sfondo colorato per tipo** + **striscia colorata a sinistra** (divisione visiva chiara per tipo — NON togliere mai).
3. **Pallino tondo a sinistra** per spuntare "fatto" (NON sostituire con bottoni).
4. **Riga etichette**: Tipo (pillola colorata) · **Ruolo HOST/PM ben evidente** (pillola colorata: HOST rosa, PM verde) · **Canale colorato** (Airbnb rosa, Booking blu, VRBO indaco, Diretta verde, b&b teal).
5. **Casa · Ospite** (grande).
6. **Prenotazione (parte COMUNE, campi fissi uguali per tutti, valori per ospite)**:
   casa, ospite, **check-in → check-out** sempre presenti.
7. **Blocco "da copiare" (specifico per documento)** — testi prima, cifre dopo:
   - **Scontrino**: Descrizione `PRENOTAZIONE <ota> <cod>` + Importo lordo ospite → bottone Apri ADE.
   - **Autofattura**: Causale `PRENOTAZIONE <ota> <cod>` + Imponibile (solo) → Apri Passgo.
   - **Fattura PM**: Causale `gestione <casa> - <canale> - <cod>` + Importo (noto, o **stima** lordo×% con "in attesa fattura ufficiale") → Apri Passgo.
   - **Alloggiati**: nessun campo, solo bottone **Apri Kross**.
   - **ROSS**: bottone **Apri Kross**.
   - **Promemoria**: breve testo dell'azione, nessun campo.
8. **Bottone azione** apre **fuori dall'app** (scheda esterna). Colore neutro (NON il rosa dei canali).

## Regole liste / home
- Titolo **"🚨 Da fare oggi" lampeggiante**; i task sotto NON ripetono la scadenza.
- Sezioni raggruppate per data (la data è nel titolo del gruppo, non in ogni card).
- I task **completati spariscono dalla home** → solo Archivio.
- Le scadenze di OGGI sempre per prime; gli accorpabili (giorno migliore) vengono dopo.

## Colori
- Sfondi tenui per tipo: scontrino rosa, autofattura blu, fattura verde, alloggiati ciano, promemoria viola, ross grigio. Niente neri.
- Etichette con font bianco/colore leggibile.

## Regole fiscali da rispettare (dai PROGETTO §6)
- Dirette e b&b.it → NIENTE autofattura.
- Autofattura Booking → mensile (gestione separata), non per prenotazione.
- Scontrino → solo case proprie (Ca' Balenga, La Ciucarina).
- Lordo Airbnb va salvato (per la stima fattura PM).

## Notifiche
- Chiave VAPID pubblica nel codice; privata su Vercel (env `VAPID_PRIVATE_KEY`).

## Dati / coerenza
- I campi comuni della prenotazione (check-in/out) devono essere IDENTICI su ogni task
  della stessa prenotazione (match per codice o casa+ospite). Dove manca il check-out
  nei dati storici → va recuperato dalle email (backfill su Supabase).
