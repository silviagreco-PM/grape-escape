# 📌 A che punto siamo — The Grape Escape (app fisco)

> Foglietto per ritrovare il filo in una nuova chat. Aggiornato il 2026-06-17.

## Dove vive l'app
- **App online (quella che usa Silvia):** https://grape-escape.vercel.app — ospitata su **Vercel**.
- Vercel pubblica la cartella **`deploy/`** (vedi `vercel.json` → `outputDirectory`). Quindi conta `deploy/index.html`. Tenere `index.html` (radice) e `deploy/index.html` **sincronizzati**.
- Database: **Supabase** (tabella `tasks`, con sicurezza RLS per utente).
- Notifiche push: funzioni su Vercel in `api/send-push.mjs` e `api/daily-push.mjs` (cron 8:00).
- Motore prenotazioni: **Google Apps Script** (`google-apps-script/Code.gs`) legge Gmail (Airbnb/Booking/Kross) e crea i task in Supabase.
- Residui da ignorare/ripulire: ci sono ancora collegamenti **Netlify** e **Cloudflare Workers** al repo (il build Cloudflare fallisce, ma è solo un avanzo: l'app vera è su Vercel).

## ✅ Fatto (nel codice)
- App che si aggiorna da sola con le nuove prenotazioni (fix realtime `setAuth` + ricarica su riapertura/focus).
- Notifiche migrate su Vercel.
- Script Gmail che legge bene il formato **Kross** (date Arrivo/Partenza, ospite "Riferimento:", importo "Totale tariffa", canale Airbnb/Booking reale) + "Callianetto" → La Tana del Tasso.
- **Mail di recap** ogni mattina alle 7 (funzione `inviaRecapGiornaliero` nel Code.gs).

## ⏳ Da fare (passi manuali di Silvia)
1. **Mettere in onda** le correzioni (merge della PR #1 su `master` → Vercel pubblica).
2. **Variabili su Vercel** (Settings → Environment Variables): `PUSH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` → poi **Redeploy**.
3. **Script Google** (script.google.com): incollare il `Code.gs` aggiornato, impostare `PUSH_URL = https://grape-escape.vercel.app/api/send-push`, eseguire `impostaTrigger`.
4. **Telefono**: aprire l'app e attivare le notifiche (1 tap).

## 🧰 Connettori utili in chat
- **Vercel** e **Supabase** collegati: in una chat nuova permettono all'AI di impostare le variabili e scrivere i task direttamente.
- **Gmail** collegata: l'AI può rileggere le prenotazioni e togliere le etichette `grape-escape/elaborata` per farle rielaborare.

## Prenotazioni recenti da controllare (giugno 2026)
- **Regina Weinheimer** — Ca' Balenga (casa propria), Airbnb HMDJX2MEAW, 16→18 giu, 198,40 € → scontrino + alloggiati.
- **Pasovski Metin** — Callianetto/La Tana del Tasso (gestione), Booking 5113508343, 18→21 giu, 412,43 € → fattura PM.
- **Loffredo Fabia** — Casa Amalia (gestione), Booking 6205466032, 12→14 dic, 221,07 € → fattura PM.
