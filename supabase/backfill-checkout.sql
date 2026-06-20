-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL CHECK-OUT mancanti — The Grape Escape
-- ════════════════════════════════════════════════════════════════════════════
-- Scopo: alcune card mostrano solo la freccina di ARRIVO (↘) perché nel database
-- manca il check-out nella nota (prenotazioni tipo Petra, entrate da un messaggio
-- ospite senza conferma Kross, o task creati da una vecchia versione dello script).
-- Il frontend ricava arrivo/partenza dal testo della nota ("Check-in gg/mm,
-- check-out gg/mm"): se il check-out non c'è, la freccina ↗ non compare.
--
-- Questo script aggiunge la riga "Check-in gg/mm, check-out gg/mm." SOLO ai task
-- che NON hanno già un check-out (clausola AND ... NOT ILIKE '%check-out%').
-- È quindi SICURO e RIPETIBILE: lanciarlo più volte non fa danni, e i task già
-- a posto vengono ignorati. Le date vengono dalle email di prenotazione.
--
-- Come usarlo: Supabase → SQL Editor → New query → incolla tutto → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper concettuale: per ogni prenotazione, aggiorna tutti i suoi task (scontrino,
-- alloggiati, fattura) abbinati per prefisso del codice (es. '5113508343%' prende
-- sia 5113508343_sc che 5113508343_al).

-- Petra Wallner — Ca' Balenga (Booking 5698731762) — 19/06 → 25/06
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 19/06, check-out 25/06.'
  WHERE codice LIKE '5698731762%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Pasovski Metin — La Tana del Tasso (Booking 5113508343) — 18/06 → 21/06
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 18/06, check-out 21/06.'
  WHERE codice LIKE '5113508343%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Regina Weinheimer — Ca' Balenga (Airbnb HMDJX2MEAW) — 16/06 → 18/06
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 16/06, check-out 18/06.'
  WHERE codice LIKE 'HMDJX2MEAW%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Dmitry Alymov (Airbnb HM4SH5KTYH) — 19/06 → 23/06
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 19/06, check-out 23/06.'
  WHERE codice LIKE 'HM4SH5KTYH%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Elliņš Ervīns (Booking 6567942106) — 03/07 → 08/07
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 03/07, check-out 08/07.'
  WHERE codice LIKE '6567942106%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Paul Alfieri (Airbnb HMF5R4FHP5) — 16/07 → 18/07
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 16/07, check-out 18/07.'
  WHERE codice LIKE 'HMF5R4FHP5%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Karina Barquet (Airbnb HM2NNWBFKK) — 10/07 → 14/07
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 10/07, check-out 14/07.'
  WHERE codice LIKE 'HM2NNWBFKK%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Elena Poliani (Airbnb HMSMPZRSKB) — 02/10 → 05/10
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 02/10, check-out 05/10.'
  WHERE codice LIKE 'HMSMPZRSKB%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- krauchthaler kathy et Urs (Booking 5288275855) — 14/09 → 21/09
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 14/09, check-out 21/09.'
  WHERE codice LIKE '5288275855%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- Loffredo Fabia (Booking 5858196159) — 12/12 → 16/12
UPDATE tasks SET note = CASE WHEN COALESCE(trim(note),'')='' THEN '' ELSE trim(note)||' ' END
  || 'Check-in 12/12, check-out 16/12.'
  WHERE codice LIKE '5858196159%' AND COALESCE(note,'') NOT ILIKE '%check-out%';

-- ════════════════════════════════════════════════════════════════════════════
-- Controllo: elenca i task ancora SENZA check-out (dovrebbero restare solo quelli
-- di cui non conosciamo la data). Aggiungi qui altre righe UPDATE se ne compaiono.
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT id, casa, ospite, codice, note FROM tasks
--   WHERE COALESCE(note,'') NOT ILIKE '%check-out%' AND tipo IN ('scontrino','alloggiati','fattura-pm')
--   ORDER BY scadenza;
