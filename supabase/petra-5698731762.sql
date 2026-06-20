-- Task mancanti per la prenotazione di Petra Wallner (Booking 5698731762).
-- Booking non ha mandato la conferma a Kross: lo script non li aveva creati.
-- Dati ricavati dall'email-messaggio di Booking del 19/06.
-- Ca' Balenga = casa propria (HOST) → scontrino (giorno check-in) + alloggiati (entro 24h).
-- Importo scontrino da inserire a mano (non presente nell'email).
INSERT INTO tasks (id, user_id, tipo, casa, ospite, canale, importo, cohost, codice, scadenza, link, note, completato, in_batch, creato_il)
VALUES
('gas_5698731762_sc','094465a0-8353-48ed-820d-f98d832b4ff1','scontrino','Ca'' Balenga','Petra Wallner','Booking',NULL,NULL,'5698731762','2026-06-19','ade','Check-in 19/06, check-out 25/06.',false,false,'2026-06-19T01:06:10Z'),
('gas_5698731762_al','094465a0-8353-48ed-820d-f98d832b4ff1','alloggiati','Ca'' Balenga','Petra Wallner','Booking',NULL,NULL,'5698731762','2026-06-20','','Comunicazione Alloggiati Web entro 24h dall''arrivo. Check-in 19/06, check-out 25/06.',false,false,'2026-06-19T01:06:10Z')
ON CONFLICT (id) DO NOTHING;
