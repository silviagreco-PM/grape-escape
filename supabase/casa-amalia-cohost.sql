-- ════════════════════════════════════════════════════════════════════════════
-- RECUPERO COMPENSO COHOST — fattura PM Casa Amalia (Carlotta Barbolla)
-- ════════════════════════════════════════════════════════════════════════════
-- La fattura PM mostrava solo la stima "in attesa fattura ufficiale" perché nel
-- database mancava il compenso cohost. La cifra vera è arrivata col payout Airbnb:
--   "Compenso del co-host • 18/06/2026–21/06/2026 • Casa Amalia • 96,93 € EUR"
--   (email Airbnb del 19/06, prenotazione HMZ94DQZMC).
--
-- Dopo questo UPDATE la card mostra "Importo da fatturare 96,93 €" (cifra reale,
-- non più stima) e — con il fix logico nel frontend — rientra in "Portati avanti".
--
-- SICURO e RIPETIBILE: aggiorna solo se il cohost è ancora vuoto.
-- Come usarlo: Supabase → SQL Editor → New query → incolla → Run.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE tasks
  SET cohost = 96.93
  WHERE codice LIKE 'HMZ94DQZMC%'
    AND tipo = 'fattura-pm'
    AND cohost IS NULL;

-- Controllo:
-- SELECT id, casa, ospite, canale, importo, cohost, codice, scadenza
--   FROM tasks WHERE codice LIKE 'HMZ94DQZMC%';
