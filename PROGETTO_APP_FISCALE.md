# APP FISCALE E ADEMPIMENTI - The Grape Escape

Specifica completa del progetto. Questo documento è la fonte di verità: ogni funzione dell'app deve rispettare le regole qui definite.

## 1. Obiettivo

App di task management fiscale/operativo per Silvia Greco (HO.ST DI GRECO SILVIA), property manager e host imprenditoriale nel Monferrato. Uso esclusivo personale. Ogni mattina l'app risponde alla domanda: "cosa devo fare oggi per non saltare nessun adempimento?"

Fuori perimetro (Fase 2, app separata): calendario pulizie, login collaboratrici, gestione operativa check-in/check-out.

## 2. Contesto fiscale

- Regime forfettario, due codici ATECO
- Due ruoli distinti, mai mischiati:
  - **Host imprenditoriale** per le proprie case (Ca' Balenga ad Asti, La Ciucarina a Camagna Monferrato): scontrini, autofatture TD17, tutti gli obblighi fiscali
  - **Property manager** per case di terzi: solo fattura della fee al proprietario, nessun sostituto d'imposta, host fiscale è sempre il proprietario
- IVA da F24 (reverse charge TD17): gestita dal commercialista, FUORI dall'app

## 3. Proprietà

### Case proprie (host fiscale: Silvia)

| Casa | Comune | Canali |
|---|---|---|
| Ca' Balenga | Asti | Airbnb, Booking, VRBO, b&b.it |
| La Ciucarina | Camagna Monferrato | Airbnb, Booking |

### Case in gestione (host fiscale: proprietario)

| Casa | Proprietario (intestatario fattura fee) | % OTA | % diretta proprietario | % diretta PM | Extra ricorrenti | Canali |
|---|---|---|---|---|---|---|
| Appartamento del Palio | Ana Krapovickas | 20% | 20% | 30% | PriceLabs 15 €/mese | Airbnb, Booking |
| Casa Amalia (Viarigi) | Paola Conti | 25% | 20% | 30% | nessuno | Airbnb, Booking |
| La Tana del Tasso (Callianetto) | Saba | 26% | 20% | 30% | nessuno | Airbnb, Booking |
| Tenuta del Mulino (Montemagno) | Umberto Di Capua | 20% | 20% | 25% | check-in 15 € per soggiorni sotto 7 notti | solo Airbnb |
| Villa Omedè | Andrea Grosso | 30% | 25% | 35% | pulizie/lavanderia 300 €/soggiorno | solo Airbnb |

Castellero: gestione cessata il 31/05/2026. Non genera nuovi task.

La percentuale fee dipende dal canale della prenotazione: l'app deve riconoscere il canale e applicare l'aliquota corretta.

Formula base fee PM: (lordo OTA + pulizie − commissioni OTA) × % PM, più gli extra contrattuali della casa.

### Contratti (per alert rinnovo/recesso)

| Casa | Avvio | Scadenza/rinnovo | Preavviso recesso | Note |
|---|---|---|---|---|
| Palio | 07/04/2025 | 07/07/2027, poi rinnovo annuale (rinnovato il 07/07/2026) | 15 giorni | penale: gestione PM o 50% commissione su prenotazioni confermate |
| Casa Amalia | 01/03/2026 | 28/02/2027, rinnovo automatico 12 mesi | 30 giorni | recesso anticipato proprietaria: 500 € |
| Tana del Tasso | 01/04/2026 | 01/04/2027, rinnovo automatico annuale | 60 giorni | recesso solo senza prenotazioni future; compensi maturati sempre dovuti |
| Mulino | 25/02/2025 | 25/02/2027, rinnovo automatico | 3 mesi | penale: gestione PM o 50% commissione su prenotazioni confermate |
| Villa Omedè | 15/05/2026 | 30/09/2026, incarico stagionale | 15 giorni, solo senza prenotazioni confermate | recesso illegittimo: 1.000 € + compensi prenotazioni attive + 300 €/soggiorno |

Alert automatico 30 giorni prima di ogni scadenza di rinnovo e all'apertura di ogni finestra di recesso.

## 4. Task trigger-based (da email Gmail)

Mittenti noti:
- Airbnb: automated@airbnb.com (conferme prenotazione, fatture commissioni)
- Krossbooking: noreply@krossbooking.com (prenotazioni, modifiche, cancellazioni, incluse le dirette)
- Booking, VRBO, b&b.it: conferme via email

### Case proprie (Balenga, Ciucarina)

| Evento | Task | Scadenza |
|---|---|---|
| Prenotazione OTA confermata | Autofattura TD17 sulla commissione | Il giorno stesso della conferma, anche per soggiorni futuri lontani |
| Check-in (qualsiasi canale, dirette incluse) | Scontrino fiscale via ADE, importo lordo ospite pulizie incluse | Il giorno stesso del check-in |
| Cancellazione | Autofattura di storno, stesso importo con segno negativo | Il giorno stesso della cancellazione |

> **Cancellazione prima del check-in (case proprie).** L'autofattura sulla commissione è dovuta **comunque**, perché la commissione è stata addebitata alla conferma: si emette l'autofattura **originale con la data di conferma** e **poi** l'autofattura di **storno con la data di cancellazione**. Sono **2 documenti**, di **competenza del mese della conferma** (es. conferma a giugno → entrambi entro il 15 luglio), anche se la disdetta arriva prima della scadenza e non avevi ancora emesso nulla. Lo **scontrino** e l'**Alloggiati** invece **non** sono dovuti (il soggiorno non è avvenuto). [Confermato dal commercialista, 26/06/2026]
| Modifica prenotazione (date/importo) | Autofattura integrativa sulla differenza di commissione | Il giorno stesso della modifica |
| Check-in (tutte le case) | Alloggiati Web | Entro 24 ore dall'arrivo |

### Case in gestione

| Evento | Task | Scadenza |
|---|---|---|
| Prenotazione Airbnb confermata | Fattura fee PM al proprietario | Entro 12 giorni dal check-in (Airbnb paga il giorno dopo il check-in) |
| Email Booking del 3 del mese | Calcolo fee PM mensile + fattura riepilogativa per ogni proprietario | Promemoria mensile |
| Pagamento quota Booking dal proprietario (trigger MANUALE) | Fattura fee PM | Entro 12 giorni dal pagamento |
| Check-in (tutte le case) | Alloggiati Web | Entro 24 ore dall'arrivo |

Nota: nessuna nota di credito PM per cancellazioni. La fattura fee parte sempre dopo il check-in, una cancellazione avviene sempre prima dell'emissione.

## 5. Task periodici

| Task | Scadenza |
|---|---|
| ROSS1000 / ISTAT (tutte le case) | Entro il 10 di ogni mese, sul mese precedente |
| Tassa di soggiorno Comune di Asti (solo Palio, Ca' Balenga, Villa Omedè) | 15/01, 15/04, 15/07, 15/10 sul trimestre precedente |
| Scarico fatture OTA (Airbnb + Booking) | Entro il 5 del mese successivo |
| Trasmissione SDI autofatture | Coordinata col commercialista, entro il 15 del mese successivo |

## 6. Regole fiscali TD17 (formato definitivo)

| Campo | Regola |
|---|---|
| Data integrativa | Ultimo giorno del mese precedente alla trasmissione (formato ggmmaaaa) |
| Data documento | Data fattura OTA |
| Numero documento | ID OTA |
| Imponibile | Commissioni |
| Imposta | IVA 22% |

- Airbnb: una riga/autofattura per ogni prenotazione
- Booking: fattura riepilogativa mensile
- VRBO: estera (Expedia), reverse charge, TD17 come Airbnb
- b&b.it: società italiana, fattura con IVA esposta, NIENTE TD17

### Esclusioni assolute (mai autofattura)

- Prenotazioni dirette (Booking Engine, Front Office, contatti nominali)
- Amici e pagamenti fuori sistema
- Fatture OTA con IVA già esposta (periodo cedolare secca, pre-imprenditoriale)
- Tutte le case in gestione (host fiscale è il proprietario)

### Principi operativi

- Si chiude mese per mese, mai mischiare mesi diversi
- Fonte di verità: fattura OTA reale, mai gli export CSV di Kross (importi inaffidabili se le tariffe differiscono)
- Sempre separare ruolo host e ruolo PM

## 7. Requisiti interfaccia

- Mobile-first: Silvia lavora al 99% da telefono Android
- Vista principale: "Da fare oggi", task card con tipo (scontrino, autofattura, fattura PM, Alloggiati, periodico), casa, ospite, canale, scadenza con colore (rosso oggi/scaduto, arancio domani, grigio futuro), importo
- Ogni dato da incollare in sistemi esterni (ADE, Passgo) ha il suo bottone copia separato: importo, codice prenotazione, ID fattura. Mai testo da selezionare a mano
- Link diretti: ADE (ivaservizi.agenziaentrate.gov.it), Passgo, Alloggiati Web, ROSS1000
- Spunta task come fatto: il task non si cancella, va in archivio con data di completamento
- Task scaduti non spuntati restano in cima ogni giorno finché non vengono fatti
- Email di riepilogo automatica ogni mattina alle 7:00 con i task del giorno
- Inserimento manuale task possibile (es. pagamento Booking ricevuto dal proprietario)

## 8. Stack tecnico

- Frontend: HTML/CSS/JS mobile-first, hosting Vercel (gratuito)
- Lettura email: Gmail API
- Database: Google Sheets su Drive
- Logica/scheduler: Google Apps Script o Vercel serverless (gratuito)
- Costi ricorrenti: zero o quasi

## 9. Mockup esistente

Esiste un mockup HTML della dashboard (task card con bottoni copia, colori scadenza, link ADE) approvato come direzione grafica. Riprodurre quello stile.
