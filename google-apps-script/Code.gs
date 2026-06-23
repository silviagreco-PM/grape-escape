// ═══════════════════════════════════════════════════════════════════════════════
// The Grape Escape — Gmail Processor
// Legge le email di Airbnb, Booking e Kross e crea i task nell'app
// Completamente gratuito — gira dentro Google
// ═══════════════════════════════════════════════════════════════════════════════

// ── IMPOSTAZIONI (vedi istruzioni SETUP) ──────────────────────────────────────
var CFG = PropertiesService.getScriptProperties().getProperties();
// CFG.SUPABASE_URL       → indirizzo del database
// CFG.SUPABASE_KEY       → chiave segreta del database (service_role)
// CFG.SUPABASE_USER_ID   → il tuo codice utente nel database
// CFG.PUSH_URL           → indirizzo per le notifiche push
// CFG.PUSH_SECRET        → parola segreta per le notifiche

var LABEL_OK  = 'grape-escape/elaborata';
var LABEL_ERR = 'grape-escape/errore';

// Nome annuncio su Airbnb/Booking → nome casa nell'app
var CASE_MAP = [
  ['ciucarina',            'La Ciucarina'],
  ['boutique house',       'La Ciucarina'],
  ["ca' balenga",          "Ca' Balenga"],
  ['balenga',              "Ca' Balenga"],
  ['tana del tasso',       'La Tana del Tasso'],
  ['authentic monferrato', 'La Tana del Tasso'],
  ['callianetto',          'La Tana del Tasso'],
  ['palio',                'Appartamento del Palio'],
  ['casa amalia',          'Casa Amalia'],
  ['amalia monferrato',    'Casa Amalia'],
  ['omede',                'Villa Omedè'],
  ['omedè',                'Villa Omedè'],
  ['dimora storica',       'Villa Omedè'],
  ['con piscina',          'Villa Omedè'],
  ['tenuta del mulino',    'Tenuta del Mulino'],
  ['villa indipendente',   'Tenuta del Mulino'],
  ['mulino',               'Tenuta del Mulino'],
  ['castellero',           'Castellero (Nocciole)'],
];

var CASE_HOST = ["Ca' Balenga", "La Ciucarina"];

var MESI_IT = [
  'gennaio','febbraio','marzo','aprile','maggio','giugno',
  'luglio','agosto','settembre','ottobre','novembre','dicembre'
];

// ═══ FUNZIONI PRINCIPALI ══════════════════════════════════════════════════════

/**
 * Esegui questa funzione UNA SOLA VOLTA per impostare il controllo automatico.
 * Dopo, il programma controllerà le email ogni 5 minuti da solo.
 */
function impostaTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('controllaEmailNuove').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('inviaRecapGiornaliero').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('riconciliaPrenotazioni').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('completaDatiMancanti').timeBased().everyDays(1).atHour(6).create();
  Logger.log('✅ Fatto! Email ogni 5 min + recap alle 7 + riconciliazione e auto-correzione alle 6.');
}

/**
 * Esegui questa funzione UNA SOLA VOLTA per recuperare tutte le email passate.
 * Può richiedere qualche minuto.
 */
function recuperaEmailPassate() {
  Logger.log('🔄 Sto leggendo le email vecchie...');
  _elabora('from:(airbnb.com OR booking.com OR kross) -label:' + LABEL_OK, true);
  Logger.log('✅ Fatto! Tutte le email vecchie sono state elaborate.');
}

/**
 * Questa funzione gira automaticamente ogni 5 minuti. Non serve avviarla a mano.
 */
function controllaEmailNuove() {
  _elabora(
    'from:(airbnb.com OR booking.com OR kross) -label:' + LABEL_OK + ' newer_than:3d',
    false
  );
  // Subito dopo: completa da sola i dati mancanti (es. l'email Kross arrivata dopo
  // quella Airbnb, che riempie nome ospite/importo/date precise).
  completaDatiMancanti();
}

/**
 * RETE DI SICUREZZA — gira ogni giorno. Ricontrolla i messaggi degli ospiti Booking
 * e crea i task delle prenotazioni che NON sono mai arrivate come "Nuova prenotazione"
 * (es. caso Petra: Booking non manda la conferma a Kross). I doppioni sono evitati da
 * _esistePerCodice, quindi è sicuro rieseguirla quanto si vuole. NON tocca le email.
 */
function riconciliaPrenotazioni() {
  var discussioni = GmailApp.search('from:guest.booking.com newer_than:120d', 0, 100);
  var creati = 0, viste = {};
  for (var i = 0; i < discussioni.length; i++) {
    var messaggi = discussioni[i].getMessages();
    for (var j = 0; j < messaggi.length; j++) {
      var msg = messaggi[j];
      var corpo = msg.getPlainBody();
      if (!/dati della prenotazione/i.test(corpo)) continue;
      var d = _analizzaEmail(msg.getSubject(), corpo, 'booking', msg.getDate());
      if (!d || d.tipo !== 'prenotazione' || !d.codice || !d.checkin) continue;
      if (viste[d.codice]) continue;
      viste[d.codice] = true;
      creati += _creaTask(d, true); // storico=true → salta se la prenotazione esiste già
    }
  }
  if (creati > 0) {
    _notifica('🔎 ' + creati + (creati === 1 ? ' prenotazione recuperata' : ' prenotazioni recuperate'),
              'Una prenotazione che mancava è stata aggiunta in automatico — apri l\'app.');
  }
  Logger.log('Riconciliazione: ' + creati + ' task creati');
}

/**
 * AUTO-CORREZIONE — completa da sola i task con dati incompleti.
 * Trova scontrini/alloggiati/fatture senza nome ospite (o senza importo se è una
 * DIRETTA) e li completa rileggendo le email Gmail della STESSA prenotazione, dando
 * priorità a Kross per nome e date (Riferimento, Arrivo/Partenza). L'IMPORTO si prende
 * da Airbnb ("Totale (EUR)") o dalle Dirette (Kross); per Booking lo confermi tu. Se è
 * una casa propria, crea anche l'autofattura TD17 mancante con la commissione Airbnb.
 * Serve perché spesso l'email Airbnb arriva per prima e crea il task con dati
 * incompleti; quando poi arriva l'email Kross (completa) viene saltata come
 * doppione, quindi i suoi dati non venivano mai scritti. Qui li recuperiamo.
 * Riempie SOLO i campi vuoti — non tocca mai i valori già presenti (le correzioni
 * manuali restano al sicuro). Gira da sola dopo ogni controllo email e ogni
 * mattina. Sicura da rieseguire quanto si vuole.
 */
function completaDatiMancanti() {
  var tasks;
  try {
    var q = 'tasks?select=id,codice,tipo,canale,ospite,importo,note,scadenza'
      + '&user_id=eq.' + CFG.SUPABASE_USER_ID
      + '&completato=eq.false'
      + '&tipo=in.(scontrino,alloggiati,fattura-pm)'
      + '&order=creato_il.desc&limit=400';
    tasks = JSON.parse(_db(q).getContentText()) || [];
  } catch (e) { Logger.log('completaDati: lettura DB fallita — ' + e); return 0; }

  var manca = function(v) { return v === null || v === undefined || v === '' || v === '—' || v === '-'; };
  var incompleti = tasks.filter(function(t) {
    if (!t.codice) return false;
    var noNome = manca(t.ospite);
    // L'importo si recupera da Airbnb ("Totale (EUR)", ufficiale) e da Kross ("Totale
    // tariffa", per Booking/Dirette). Quello Kross viene marcato "da verificare".
    var noImp  = (t.tipo !== 'alloggiati') && manca(t.importo);
    return noNome || noImp;
  });
  if (!incompleti.length) { Logger.log('completaDati: niente da completare'); return 0; }

  // Raggruppa per codice prenotazione base (toglie i suffissi _sc / _al).
  var perCodice = {};
  incompleti.forEach(function(t) {
    var base = String(t.codice).replace(/_(sc|al|st)$/i, '');
    (perCodice[base] = perCodice[base] || []).push(t);
  });

  var fatti = 0;
  Object.keys(perCodice).forEach(function(base) {
    var info = _datiDaGmail(base);
    if (!info) return;
    perCodice[base].forEach(function(t) {
      var patch = {};
      if (manca(t.ospite) && info.ospite) patch.ospite = info.ospite;
      if (t.tipo !== 'alloggiati' && manca(t.importo) && info.importo) {
        patch.importo = info.importo;
        // Importo da Kross → marca "da verificare" nella nota (se non c'è già).
        if (info.importoFonte === 'kross') {
          var nB = (patch.note != null ? patch.note : (t.note || ''));
          if (!/\[importo:\s*kross\]/i.test(nB)) patch.note = (nB + ' [importo: Kross]').trim();
        }
      }

      // Date sbagliate (es. check-in preso dalla data dell'email invece che dall'arrivo
      // reale): correggi quando una fonte riconosciuta dà una data diversa da quella
      // salvata nella nota. Kross/Airbnb/Booking estraggono le date in modo esplicito.
      if (info.fonte && info.checkin) {
        var coOK = info.checkout && (t.note || '').indexOf(_ggmm(info.checkout)) >= 0;
        var ciOK = (t.note || '').indexOf(_ggmm(info.checkin)) >= 0;
        if (!ciOK || (info.checkout && !coOK)) {
          var pre = ((t.note || '').match(/^comunicazione alloggiati web[^.]*\.\s*/i)
                  || (t.note || '').match(/^.*?prenotato il[^.]*\.\s*/i) || [''])[0];
          patch.note = (pre + 'Check-in ' + _ggmm(info.checkin)
            + (info.checkout ? ', check-out ' + _ggmm(info.checkout) : '') + '.').trim();
          if (t.tipo === 'scontrino')  patch.scadenza = info.checkin;
          if (t.tipo === 'alloggiati') patch.scadenza = _aggiungiGiorni(info.checkin, 1);
          if (t.tipo === 'fattura-pm') {
            var sc = (t.canale === 'Booking') ? _scadenzaBooking(info.checkout) : _aggiungiGiorni(info.checkin, 12);
            if (sc) patch.scadenza = sc;
          }
        }
      }

      if (Object.keys(patch).length) { _aggiornaCampo(t.id, patch); fatti++; }
    });

    // AUTOFATTURA TD17 mancante: se è una casa propria (host) e l'email Airbnb ha la
    // commissione, crea l'autofattura della prenotazione se non esiste ancora. Copre i
    // casi già in archivio (es. prenotazione creata prima di questa funzione).
    var casaG = perCodice[base][0].casa;
    if (info.commissione && casaG && CASE_HOST.indexOf(casaG) >= 0) {
      var id_afG = _idTask(base, 'af');
      var baseAfG = info.prenotato || info.checkin;
      if (baseAfG && !_esistePerCodice(base + '_af', id_afG)) {
        var dAfG = new Date(baseAfG + 'T12:00:00Z');
        var scadAfG = new Date(Date.UTC(dAfG.getUTCFullYear(), dAfG.getUTCMonth() + 1, 15)).toISOString().slice(0, 10);
        _salvaTask({
          id: id_afG, tipo: 'autofattura', casa: casaG, ospite: info.ospite || '—',
          canale: 'Airbnb', scadenza: scadAfG, codice: base + '_af',
          importo: info.commissione, cohost: null, data_doc: _ggmmaaaa(baseAfG),
          note: 'Autofattura TD17 — commissione Airbnb ' + info.commissione.toFixed(2).replace('.', ',')
              + ' € (servizio host). Numero e data esatti dalla fattura IVA Airbnb del mese.',
          completato: false, completato_il: null, completato_alle: null, creato_il: new Date().toISOString(),
        });
        fatti++;
      }
    }
  });

  if (fatti > 0) {
    _notifica('✅ ' + fatti + (fatti === 1 ? ' dato completato' : ' dati completati'),
              'Ho ritrovato e inserito da solo i dati mancanti di alcune prenotazioni — apri l\'app.');
  }
  Logger.log('completaDati: ' + fatti + ' campi completati');
  return fatti;
}

// Rilegge le email Gmail di una prenotazione (cercata per codice) e restituisce i
// dati migliori disponibili. Priorità a Kross: ospite, importo e date precise.
function _datiDaGmail(codice) {
  var threads = GmailApp.search('"' + codice + '" from:(airbnb.com OR booking.com OR kross) newer_than:180d', 0, 20);
  if (!threads.length) return null;
  var msgs = [];
  for (var i = 0; i < threads.length; i++) {
    var ms = threads[i].getMessages();
    for (var j = 0; j < ms.length; j++) msgs.push(ms[j]);
  }
  // Kross prima (fonte affidabile), poi le altre email.
  msgs.sort(function(a, b) {
    return (/kross/i.test(a.getFrom()) ? 0 : 1) - (/kross/i.test(b.getFrom()) ? 0 : 1);
  });

  var best = { ospite: null, importo: null, importoFonte: null, commissione: null, checkin: null, checkout: null, prenotato: null, fonte: null };
  for (var k = 0; k < msgs.length; k++) {
    var msg = msgs[k];
    var mit = msg.getFrom().toLowerCase();
    var piatt = mit.indexOf('airbnb') >= 0 ? 'airbnb'
              : mit.indexOf('booking') >= 0 ? 'booking'
              : mit.indexOf('kross') >= 0 ? 'kross' : null;
    if (!piatt) continue;
    var corpo = msg.getPlainBody();
    if (corpo.indexOf(codice) < 0 && msg.getSubject().indexOf(codice) < 0) continue;
    var d = _analizzaEmail(msg.getSubject(), corpo, piatt, msg.getDate());
    if (!d) continue;
    if (!best.ospite && d.ospite) best.ospite = d.ospite;
    // Importo: Airbnb ("Totale (EUR)", ufficiale) oppure Kross ("Totale tariffa", per
    // Booking/Dirette). Teniamo traccia della fonte per il badge "verificato/da verificare".
    if (!best.importo && d.importo) { best.importo = d.importo; best.importoFonte = d.importoFonte; }
    if (!best.commissione && d.commissione) best.commissione = d.commissione; // servizio host Airbnb
    if (!best.prenotato && d.prenotato) best.prenotato = d.prenotato;
    // Kross sovrascrive le date (precise); le altre fonti solo se mancano.
    if (piatt === 'kross' && d.checkin) { best.checkin = d.checkin; best.checkout = d.checkout; best.fonte = 'kross'; }
    else if (!best.checkin && d.checkin) { best.checkin = d.checkin; best.checkout = d.checkout; best.fonte = piatt; }
  }
  return (best.ospite || best.importo || best.checkin || best.commissione) ? best : null;
}

// ═══ ELABORAZIONE EMAIL ═══════════════════════════════════════════════════════

function _elabora(ricerca, storico) {
  var discussioni = GmailApp.search(ricerca, 0, 100);
  var taskNuovi = 0;
  var novita = [];   // descrizioni leggibili di cosa è arrivato (per la notifica)

  for (var i = 0; i < discussioni.length; i++) {
    var messaggi = discussioni[i].getMessages();
    for (var j = 0; j < messaggi.length; j++) {
      var msg = messaggi[j];
      if (_haLabel(msg, LABEL_OK)) continue;
      try {
        var r = _leggiEmail(msg, storico);
        taskNuovi += r.creati;
        if (r.desc) novita.push(r.desc);
        _mettiLabel(msg, LABEL_OK);
      } catch(e) {
        Logger.log('❌ Errore: ' + msg.getSubject() + ' — ' + e);
        _mettiLabel(msg, LABEL_ERR);
      }
    }
  }

  // Notifica push IMMEDIATA a ogni cambio (non solo il riepilogo del mattino):
  // dice COSA è arrivato, così sai subito che c'è una fattura/scontrino da fare.
  // Saltata durante il recupero storico (storico=true) per non mandare un blocco enorme.
  if (taskNuovi > 0 && !storico) {
    var titolo = novita.length === 1 ? '🆕 Nuova prenotazione' : '🆕 ' + novita.length + ' novità';
    var corpo = novita.length
      ? novita.slice(0, 4).join(' · ') + ' — apri l\'app per scontrino/fattura.'
      : taskNuovi + ' nuovi task — apri l\'app.';
    _notifica(titolo, corpo);
  }
  if (taskNuovi > 0) Logger.log('✅ Creati ' + taskNuovi + ' task nuovi');
}

function _leggiEmail(msg, storico) {
  var mittente = msg.getFrom().toLowerCase();
  var piattaforma = mittente.indexOf('airbnb') >= 0  ? 'airbnb'
                  : mittente.indexOf('booking') >= 0 ? 'booking'
                  : mittente.indexOf('kross') >= 0   ? 'kross'
                  : null;
  if (!piattaforma) return { creati: 0, desc: null };

  var dati = _analizzaEmail(msg.getSubject(), msg.getPlainBody(), piattaforma, msg.getDate());
  if (!dati || dati.tipo === 'altro') {
    Logger.log('⏭ Tipo non riconosciuto — oggetto: ' + msg.getSubject().slice(0, 80));
    return { creati: 0, desc: null };
  }

  Logger.log('📨 ' + piattaforma + ' · ' + dati.tipo
    + ' · ' + (dati.casa || '—') + ' · ' + (dati.ospite || '—'));

  var creati = _creaTask(dati, storico);
  // Descrizione per la notifica: solo per prenotazioni/modifiche (le cose che richiedono
  // una tua azione fiscale), es. "Casa Amalia · Carlotta Barbolla".
  var desc = (creati > 0 && (dati.tipo === 'prenotazione' || dati.tipo === 'modifica'))
    ? (dati.casa || '—') + (dati.ospite ? ' · ' + dati.ospite : '')
    : null;
  return { creati: creati, desc: desc };
}

/**
 * Rimuove l'etichetta "elaborata" dalle email degli ultimi 60 giorni
 * così possono essere rilette da recuperaEmailPassate.
 * Sicuro da eseguire: i task già salvati non vengono duplicati.
 */
function sblocca() {
  var label = GmailApp.getUserLabelByName(LABEL_OK);
  if (!label) { Logger.log('Etichetta non trovata.'); return; }
  var threads = GmailApp.search('label:' + LABEL_OK + ' from:(airbnb.com OR booking.com OR kross) newer_than:60d', 0, 200);
  Logger.log('🔓 Trovate ' + threads.length + ' discussioni, rimozione etichetta...');
  var ok = 0, err = 0;
  for (var i = 0; i < threads.length; i++) {
    try {
      label.removeFromThread(threads[i]);
      ok++;
    } catch(e) {
      err++;
    }
  }
  Logger.log('✅ Sbloccat' + (ok === 1 ? 'a' : 'e') + ' ' + ok + ' discussion' + (ok === 1 ? 'e' : 'i') + (err > 0 ? ' (' + err + ' errori ignorati)' : '') + '. Ora esegui recuperaEmailPassate.');
}

/**
 * Funzione di test: mostra le ultime 10 email di Airbnb/Booking e cosa ne pensa il programma.
 * Eseguila manualmente per vedere cosa succede con le email recenti.
 */
function diagnostica() {
  var righe = GmailApp.search('from:(airbnb.com OR booking.com OR kross) newer_than:7d', 0, 20);
  Logger.log('📬 Trovate ' + righe.length + ' discussioni negli ultimi 7 giorni');
  righe.forEach(function(thread) {
    var msg = thread.getMessages()[thread.getMessageCount() - 1]; // ultima email del thread
    var mittente = msg.getFrom().toLowerCase();
    var piattaforma = mittente.indexOf('airbnb') >= 0  ? 'airbnb'
                    : mittente.indexOf('booking') >= 0 ? 'booking'
                    : mittente.indexOf('kross') >= 0   ? 'kross'
                    : '?';
    var labels = thread.getLabels().map(function(l){ return l.getName(); }).join(', ');
    var dati = _analizzaEmail(msg.getSubject(), msg.getPlainBody(), piattaforma, msg.getDate());
    Logger.log('---');
    Logger.log('Da: ' + msg.getFrom());
    Logger.log('Oggetto: ' + msg.getSubject());
    Logger.log('Etichette: ' + (labels || 'nessuna'));
    Logger.log('→ Tipo riconosciuto: ' + (dati ? dati.tipo : '?'));
    Logger.log('→ Casa: ' + (dati && dati.casa ? dati.casa : 'NON TROVATA'));
    Logger.log('→ Ospite: ' + (dati && dati.ospite ? dati.ospite : '—'));
    Logger.log('→ Check-in: ' + (dati && dati.checkin ? dati.checkin : '—'));
  });
  Logger.log('✅ Fine diagnostica');
}

// ═══ LETTURA DEL CONTENUTO DELL'EMAIL ════════════════════════════════════════

function _analizzaEmail(oggetto, corpo, piattaforma, data) {
  var ogg = oggetto.toLowerCase();
  var cor = corpo.toLowerCase();
  var testo = oggetto + '\n' + corpo;

  var dati = {
    piattaforma: piattaforma,
    tipo: 'altro',
    casa: null,
    canale: null,
    ospite: null,
    checkin: null,
    checkout: null,
    notti: null,
    codice: null,
    importo: null,
    importoFonte: null,
    compenso: null,
    commissione: null,
    mese_fattura: null,
    prenotato: null
  };

  // Data prenotazione ≈ data di arrivo dell'email OTA (Kross/Airbnb/Booking notificano alla conferma)
  try { if (data) dati.prenotato = Utilities.formatDate(new Date(data), 'Europe/Rome', 'yyyy-MM-dd'); } catch (e) {}

  // Capisce di che tipo di email si tratta
  if (ogg.match(/cancell/)) {
    dati.tipo = 'cancellazione';
  } else if (ogg.match(/prenotaz|conferm|nuova prenot|new reserv|booking confirm|new booking|reservation|richiesta|ha prenotato|has booked|booked your/)) {
    dati.tipo = 'prenotazione';
  } else if (ogg.match(/modific|modif|alterat|changed/)) {
    dati.tipo = 'modifica';
  } else if (ogg.match(/pagamento|payout|compenso|guadagno|trasferimento|co.host|earning/)) {
    dati.tipo = 'pagamento';
  } else if (ogg.match(/fattura|invoice|iva|td17|riepilogo commissioni/)) {
    dati.tipo = 'autofattura';
  }

  // Trova la casa — cerca in oggetto + corpo (normalizza accenti e apostrofi)
  function _normalizza(s) {
    return s.toLowerCase()
      .replace(/[‘’‚‛′‵]/g, "'") // apostrofi curvi → dritti
      .replace(/à/g,'a').replace(/è/g,'e').replace(/é/g,'e')
      .replace(/ì/g,'i').replace(/ò/g,'o').replace(/ù/g,'u');
  }
  var testoPulito = _normalizza(testo); // oggetto + corpo
  for (var k = 0; k < CASE_MAP.length; k++) {
    var parola = _normalizza(CASE_MAP[k][0]);
    if (testoPulito.indexOf(parola) >= 0) {
      dati.casa = CASE_MAP[k][1];
      break;
    }
  }
  if (!dati.casa) Logger.log('⚠ Casa non trovata — oggetto: ' + oggetto.slice(0, 80));

  // Codice prenotazione Airbnb (es. HMKANPNZFF)
  var codAir = testo.match(/\b(HM[A-Z0-9]{6,10})\b/i);
  if (codAir) dati.codice = codAir[1].toUpperCase();

  // Codice prenotazione Booking (numero lungo)
  if (!dati.codice && piattaforma === 'booking') {
    var codBook = testo.match(/\b([0-9]{9,12})\b/);
    if (codBook) dati.codice = codBook[1];
  }

  // Date nel formato GG/MM/AAAA
  var dateSlash = [];
  var regData = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  var match;
  while ((match = regData.exec(testo)) !== null) {
    var d = match[3] + '-' + match[2].padStart(2,'0') + '-' + match[1].padStart(2,'0');
    if (d > '2024-01-01') dateSlash.push(d);
  }

  // Date nel formato "15 giugno 2026" o "15 giugno"
  var MESI_IT_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  var dateParole = [];
  var regMese = new RegExp('\\b(\\d{1,2})\\s+(' + MESI_IT.join('|') + ')(?:\\s+(\\d{4}))?\\b', 'gi');
  while ((match = regMese.exec(testo)) !== null) {
    var mIdx = MESI_IT.indexOf(match[2].toLowerCase()) + 1;
    if (mIdx > 0) {
      var anno = match[3] || '2026';
      var d2 = anno + '-' + String(mIdx).padStart(2,'0') + '-' + match[1].padStart(2,'0');
      if (d2 > '2024-01-01') dateParole.push(d2);
    }
  }
  // Date nel formato abbreviato "22 set" o "22 set 2026"
  var regMeseShort = new RegExp('\\b(\\d{1,2})\\s+(' + MESI_IT_SHORT.join('|') + ')(?:\\s+(\\d{4}))?\\b', 'gi');
  while ((match = regMeseShort.exec(testo)) !== null) {
    var mIdx2 = MESI_IT_SHORT.indexOf(match[2].toLowerCase()) + 1;
    if (mIdx2 > 0) {
      var anno2 = match[3] || '2026';
      var d3 = anno2 + '-' + String(mIdx2).padStart(2,'0') + '-' + match[1].padStart(2,'0');
      if (d3 > '2024-01-01') dateParole.push(d3);
    }
  }

  // Prende le prime due date trovate come check-in e check-out
  var tutteDate = dateSlash.concat(dateParole).sort();
  if (tutteDate.length >= 2) {
    dati.checkin  = tutteDate[0];
    dati.checkout = tutteDate[1];
    if (dati.checkin === dati.checkout && tutteDate.length > 2) dati.checkout = tutteDate[2];
  } else if (tutteDate.length === 1) {
    dati.checkin = tutteDate[0];
  }

  // Nome ospite (cerca pattern comuni). NOME = una o due-tre parole con iniziale
  // maiuscola, anche accentate o con apostrofo/trattino (es. "D'Angelo", "Müller").
  var NM = "([A-ZÀ-Þ][a-zà-ÿ'’.\\-]+(?:\\s+[A-ZÀ-Þ][a-zà-ÿ'’.\\-]+){1,2})";
  var patOspite = [
    new RegExp("ospite[:\\s]+" + NM, "i"),
    new RegExp("guest[:\\s]+" + NM, "i"),
    new RegExp("nome dell['’]ospite[:\\s]+" + NM, "i"),
    new RegExp("nome[:\\s]+" + NM, "i"),
    new RegExp("prenotazione di " + NM, "i"),
    new RegExp("conferm(?:ata|ato)[:\\s-]+" + NM, "i"),
    new RegExp("reservation (?:for|by|with)[:\\s]+" + NM, "i"),
    new RegExp(NM + "\\s+(?:ha prenotato|has booked|has requested|arriva|arrives|è in arrivo)", "i"),
  ];
  for (var p = 0; p < patOspite.length; p++) {
    var m2 = testo.match(patOspite[p]);
    if (m2 && m2[1]) { dati.ospite = m2[1].trim(); break; }
  }

  // Importo (cerca simbolo € o EUR)
  var importi = [];
  var regImporto = /(?:EUR|€)\s*([0-9.,]+)/gi;
  while ((match = regImporto.exec(testo)) !== null) {
    var n = parseFloat(match[1].replace(/\./g,'').replace(',','.'));
    if (!isNaN(n) && n > 0) importi.push(n);
  }
  if (importi.length > 0) dati.compenso = Math.max.apply(null, importi);

  // PAYOUT co-host Airbnb ("Abbiamo inviato un compenso"): l'importo da fatturare al
  // proprietario è il COMPENSO CO-HOST, non un importo qualsiasi della mail. Nelle
  // email di payout il "Totale pagato" coincide col compenso co-host → usiamo quello,
  // così la cifra è precisa anche se nel testo compaiono altri numeri.
  if (dati.tipo === 'pagamento' && /co.?host/i.test(testo)) {
    dati.canale = dati.canale || 'Airbnb';
    var mTotPag = testo.match(/totale pagato:[^0-9]*([0-9.,]+)/i)
               || testo.match(/compenso del co.?host[\s\S]{0,200}?(?:EUR|€)\s*([0-9.,]+)/i);
    if (mTotPag) {
      var nTotPag = parseFloat(mTotPag[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(nTotPag) && nTotPag > 0) dati.compenso = nTotPag;
    }
  }

  // Mese per autofattura (es. "commissioni maggio 2026")
  if (dati.tipo === 'autofattura') {
    var regMeseAf = new RegExp('(?:di|del|per il mese di)\\s+(' + MESI_IT.join('|') + ')\\s+(\\d{4})', 'i');
    var mAf = testo.match(regMeseAf);
    if (mAf) {
      var mIdx2 = MESI_IT.indexOf(mAf[1].toLowerCase()) + 1;
      if (mIdx2 > 0) dati.mese_fattura = mAf[2] + '-' + String(mIdx2).padStart(2,'0');
    }
  }

  // ── KROSS: formato strutturato e affidabile (override preciso dei campi) ──
  // Le email di krossbooking hanno campi fissi: usiamoli invece di indovinare.
  if (piattaforma === 'kross') {
    // Canale reale dal soggetto. Le DIRETTE (inserite a mano in Kross) arrivano come
    // "FrontOffice" o "Booking Engine" → canale 'Diretta'. Le OTA come "Booking.com"/
    // "Booking"/"Airbnb". Ordine importante: prima le dirette, poi le OTA.
    if (/frontoffice|booking engine/i.test(oggetto)) dati.canale = 'Diretta';
    else if (/booking/i.test(oggetto))   dati.canale = 'Booking';
    else if (/airbnb/i.test(oggetto))    dati.canale = 'Airbnb';
    else dati.canale = 'Diretta';

    // Codice: "Prenotazione n. HMXXXX" oppure numero Booking
    var mCod = corpo.match(/prenotazione\s+n\.?\s*([A-Z0-9]+)/i);
    if (mCod) dati.codice = mCod[1].toUpperCase();

    // Ospite: "Riferimento: Cognome Nome"
    var mRif = corpo.match(/riferimento:\s*([^\n\r]+)/i);
    if (mRif) dati.ospite = mRif[1].trim();

    // Date precise: "Arrivo: GG/MM/AAAA" e "Partenza: GG/MM/AAAA"
    var mArr = corpo.match(/arrivo:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    var mPar = corpo.match(/partenza:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (mArr) dati.checkin  = mArr[3] + '-' + mArr[2].padStart(2,'0') + '-' + mArr[1].padStart(2,'0');
    if (mPar) dati.checkout = mPar[3] + '-' + mPar[2].padStart(2,'0') + '-' + mPar[1].padStart(2,'0');

    // Importo ospite: "Totale tariffa: Euro 412,43". Lo usiamo per BOOKING (che non
    // manda email dirette: Kross è l'unica fonte) e per le DIRETTE. Per Airbnb NO:
    // lì l'importo ufficiale arriva dall'email Airbnb ("Totale (EUR)"). Marchiamo la
    // fonte come 'kross' così l'app segnala "da verificare" (la tariffa Kross non
    // sempre coincide con quella ufficiale).
    if (dati.canale !== 'Airbnb') {
      var mTot = corpo.match(/totale tariffa:\s*(?:euro|eur|€)\s*([0-9.,]+)/i);
      if (mTot) {
        var nTot = parseFloat(mTot[1].replace(/\./g,'').replace(',','.'));
        if (!isNaN(nTot) && nTot > 0) { dati.importo = nTot; dati.importoFonte = 'kross'; }
      }
    }
    // Le email Kross di prenotazione non contengono il compenso co-host:
    // azzeriamo il valore "indovinato" (era la commissione, es. EUR 6.18).
    dati.compenso = null;

    // Casa: dai campi "Camere assegnate:" / "Prenotazione per: 1 x NOME - ..."
    if (!dati.casa) {
      var mCam = corpo.match(/camere assegnate:\s*([^\n\r]+)/i)
             || corpo.match(/prenotazione per:\s*\d*\s*x?\s*([^\n\r-]+)/i);
      if (mCam) dati.casa = _trovaCasa(mCam[1]);
    }
  }

  // ── BOOKING — email "messaggio da un ospite": contiene i "Dati della prenotazione".
  // A volte Booking NON manda la conferma a Kross: questa email è l'unica fonte, quindi
  // la usiamo per non perdere la prenotazione (i doppioni sono evitati da _esistePerCodice).
  if (piattaforma === 'booking' && /dati della prenotazione/i.test(cor)) {
    dati.tipo = 'prenotazione';
    dati.canale = 'Booking';
    var mNomeB = corpo.match(/nome dell['’]ospite:\s*([^\n\r]+)/i);
    if (mNomeB && mNomeB[1].trim()) dati.ospite = mNomeB[1].trim();
    var mNumB = corpo.match(/numero di prenotazione:\s*([0-9]{6,})/i);
    if (mNumB) dati.codice = mNumB[1];
    var _dataBk = function(lab) {
      var re = new RegExp(lab + ':\\s*(?:(?:lun|mar|mer|gio|ven|sab|dom)\\.?\\s+)?(\\d{1,2})\\s+(' + MESI_IT_SHORT.join('|') + ')\\s+(\\d{4})', 'i');
      var m = corpo.match(re);
      if (!m) return null;
      var mi = MESI_IT_SHORT.indexOf(m[2].toLowerCase()) + 1;
      return mi > 0 ? m[3] + '-' + String(mi).padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
    };
    var ciB = _dataBk('check-in'), coB = _dataBk('check-out');
    if (ciB) dati.checkin = ciB;
    if (coB) dati.checkout = coB;
  }

  // ── AIRBNB — intestazione "Nuova prenotazione confermata! NOME arriverà il GG mese".
  // Per le case Host gestite direttamente su Airbnb (non passano da Kross) questa email
  // è l'UNICA fonte affidabile: leggiamo nome e date in modo esplicito invece di
  // indovinare. Senza questo, veniva preso come check-in la DATA DELL'EMAIL (giorno della
  // prenotazione) e non la data di arrivo reale — la prenotazione sembrava già scaduta.
  if (piattaforma === 'airbnb') {
    var MESI_RE = MESI_IT.concat(MESI_IT_SHORT).join('|');
    var _meseNum = function(s) {
      s = s.toLowerCase();
      var i = MESI_IT.indexOf(s); if (i >= 0) return i + 1;
      i = MESI_IT_SHORT.indexOf(s.slice(0, 3)); return i >= 0 ? i + 1 : 0;
    };
    var _dataAir = function(gg, meseStr, anno) {
      var m = _meseNum(meseStr); if (!m) return null;
      var a;
      if (anno) a = parseInt(anno, 10);
      else {
        // Senza anno: se il mese è già passato rispetto alla prenotazione, è dell'anno
        // dopo (es. prenoti a dicembre per gennaio).
        var by = dati.prenotato ? parseInt(dati.prenotato.slice(0, 4), 10) : 2026;
        var bm = dati.prenotato ? parseInt(dati.prenotato.slice(5, 7), 10) : 1;
        a = (m < bm) ? by + 1 : by;
      }
      return a + '-' + String(m).padStart(2, '0') + '-' + String(gg).padStart(2, '0');
    };

    // Nome ospite dall'intestazione (anche un solo nome di battesimo, es. "Edris").
    var mNomeAir = testo.match(new RegExp('confermat[ao]!?\\s+([A-ZÀ-Þ][A-Za-zÀ-ÿ\'’.\\- ]*?)\\s+(?:arriver|arriva|è in arrivo)', 'i'));
    if (mNomeAir && mNomeAir[1]) dati.ospite = mNomeAir[1].trim();

    // Check-in: "arriverà il 21 ago" (intestazione) oppure etichetta "Check-in" nel corpo.
    var mCiAir = testo.match(new RegExp('arriver[àa]\\s+(?:il\\s+)?(\\d{1,2})\\s+(' + MESI_RE + ')(?:\\s+(\\d{4}))?', 'i'))
              || corpo.match(new RegExp('check[\\s\\-]?in[^0-9]{0,40}?(\\d{1,2})\\s+(' + MESI_RE + ')(?:\\s+(\\d{4}))?', 'i'));
    if (mCiAir) { var ciA = _dataAir(mCiAir[1], mCiAir[2], mCiAir[3]); if (ciA) dati.checkin = ciA; }

    // Check-out: etichetta "Check-out" nel corpo, oppure "riparte/parte il ...".
    var mCoAir = corpo.match(new RegExp('check[\\s\\-]?out[^0-9]{0,40}?(\\d{1,2})\\s+(' + MESI_RE + ')(?:\\s+(\\d{4}))?', 'i'))
              || corpo.match(new RegExp('(?:riparte|parte|se ne va)\\s+(?:il\\s+)?(\\d{1,2})\\s+(' + MESI_RE + ')(?:\\s+(\\d{4}))?', 'i'));
    if (mCoAir) { var coA = _dataAir(mCoAir[1], mCoAir[2], mCoAir[3]); if (coA) dati.checkout = coA; }

    // Se il check-out "indovinato" prima non è oltre il check-in vero, scartalo.
    if (dati.checkin && dati.checkout && dati.checkout <= dati.checkin) dati.checkout = null;

    // Importo LORDO ospite = "Totale (EUR)" (es. 286,10 €). È quello che ha pagato
    // l'ospite: lo usiamo come importo dello scontrino / della fattura.
    var mTotAir = corpo.match(/totale\s*\(eur\)[^0-9]{0,20}([0-9][0-9.,]*)/i);
    if (mTotAir) {
      var nTA = parseFloat(mTotAir[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(nTA) && nTA > 0) { dati.importo = nTA; dati.importoFonte = 'airbnb'; } // ufficiale
    }
    // Commissione Airbnb = "Costi del servizio dell'host (15.5%)" (es. -44,35 €). È la
    // base dell'autofattura TD17 (solo per le case proprie). Il valore è negativo:
    // prendiamo il modulo. Salta la percentuale tra parentesi prima del numero.
    var mCommAir = corpo.match(/costi del servizio dell['’]?\s*host\s*\([^)]*\)[^0-9]{0,20}([0-9][0-9.,]*)/i)
                || corpo.match(/costi del servizio dell['’]?\s*host[^0-9(]{0,20}([0-9][0-9.,]*)/i);
    if (mCommAir) {
      var nCA = parseFloat(mCommAir[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(nCA) && nCA > 0) dati.commissione = nCA;
    }
  }

  return dati;
}

// ═══ CREAZIONE TASK NEL DATABASE ══════════════════════════════════════════════

function _trovaCasa(nome) {
  if (!nome) return null;
  var n = nome.toLowerCase()
    .replace(/à/g,'a').replace(/è/g,'e').replace(/é/g,'e')
    .replace(/ì/g,'i').replace(/ò/g,'o').replace(/ù/g,'u');
  for (var i = 0; i < CASE_MAP.length; i++) {
    var kw = CASE_MAP[i][0]
      .replace(/à/g,'a').replace(/è/g,'e').replace(/é/g,'e')
      .replace(/ì/g,'i').replace(/ò/g,'o').replace(/ù/g,'u');
    if (n.indexOf(kw) >= 0) return CASE_MAP[i][1];
  }
  return null;
}

function _aggiungiGiorni(data, giorni) {
  var d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

// Data ISO (2026-07-10) → "10/07/2026" per il campo data_doc dell'autofattura.
function _ggmmaaaa(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
}

// Data ISO (2026-07-10) → "10/07" per le note (stesso formato usato ovunque nell'app)
function _ggmm(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] : iso;
}

function _scadenzaBooking(checkout) {
  if (!checkout) return null;
  var d = new Date(checkout + 'T12:00:00Z');
  // Booking paga circa il 3 del mese dopo il checkout
  var pagamento = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 3));
  return _aggiungiGiorni(pagamento.toISOString().slice(0, 10), 12);
}

function _idTask(codice, suffisso) {
  return ('gas_' + (codice || 'x') + '_' + suffisso)
    .replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 50);
}

function _creaTask(d, storico) {
  var ora  = new Date().toISOString();
  var casa = d.casa || _trovaCasa(d.casa);
  var creati = 0;

  // CANCELLAZIONE: segna scontrino/alloggiati/fattura come annullati.
  // Per le case PROPRIE (host) serve anche un'AUTOFATTURA DI STORNO (data cancellazione):
  // l'autofattura originale resta emessa, lo storno la annulla fiscalmente.
  if (d.tipo === 'cancellazione') {
    if (d.codice) _annullaTask(d.codice);
    if (casa && CASE_HOST.indexOf(casa) >= 0) {
      var oggiC = new Date().toISOString().slice(0, 10);
      var id_st = _idTask(d.codice || casa, 'st');
      if (!_esiste(id_st)) {
        _salvaTask({
          id: id_st, tipo: 'autofattura', casa: casa,
          ospite: 'Storno autofattura' + (d.ospite ? ' — ' + d.ospite : ''),
          canale: d.canale || 'Airbnb', scadenza: oggiC, codice: (d.codice || '') + '_st',
          importo: d.compenso || null, cohost: null,
          note: 'Autofattura di STORNO (prenotazione cancellata). Emetti lo storno con data odierna; l\'autofattura originale resta valida.',
          completato: false, completato_il: null, completato_alle: null, creato_il: ora,
        });
        creati++;
      }
    }
    return creati;
  }

  // PAGAMENTO (payout co-host Airbnb): scrive il compenso co-host sulla fattura PM
  // di quella prenotazione, così la card mostra l'importo reale (non più la stima).
  // Match per CODICE (robusto, indipendente dall'id) e SOLO se il cohost è ancora
  // vuoto, per non sovrascrivere eventuali correzioni manuali.
  if (d.tipo === 'pagamento') {
    if (d.codice && d.compenso) _impostaCohostFattura(d.codice, d.compenso);
    return 0;
  }

  // AUTOFATTURA IVA (TD17 per commissioni Airbnb)
  if (d.tipo === 'autofattura' && d.mese_fattura) {
    var parti = d.mese_fattura.split('-').map(Number);
    var scad = new Date(Date.UTC(parti[0], parti[1], 15)).toISOString().slice(0, 10);
    var id_af = _idTask('af_' + d.mese_fattura, 'af');
    if (!storico || !_esiste(id_af)) {
      _salvaTask({
        id: id_af, tipo: 'autofattura',
        casa: casa || '—', ospite: 'Autofattura ' + d.mese_fattura,
        canale: 'Airbnb', scadenza: scad, codice: 'af_' + d.mese_fattura,
        importo: d.compenso || null, cohost: null,
        note: 'IVA commissioni Airbnb ' + d.mese_fattura + ' — emetti TD17 entro il 15.',
        completato: false, completato_il: null, completato_alle: null, creato_il: ora,
      });
      creati++;
    }
    return creati;
  }

  // PRENOTAZIONE o MODIFICA
  if (d.tipo !== 'prenotazione' && d.tipo !== 'modifica') return 0;
  if (!d.checkin) {
    Logger.log('⚠ Nessuna data check-in trovata');
    if (!storico) _notifica('⚠ Prenotazione da controllare', 'Arrivata una prenotazione (' + (d.codice||'senza codice') + ') senza data di arrivo leggibile: controllala a mano nell\'app.');
    return 0;
  }
  if (!casa) {
    Logger.log('⚠ Nome annuncio non riconosciuto: ' + (d.casa || '—') + ' cod ' + (d.codice||'—'));
    if (!storico) _notifica('⚠ Prenotazione da controllare', 'Arrivata una prenotazione (' + (d.codice||'senza codice') + ') ma non ho riconosciuto la casa: aprila e aggiungila a mano.');
    return 0;
  }

  var isHost    = CASE_HOST.indexOf(casa) >= 0;
  // Canale OTA reale: per le email Kross lo leggiamo dal soggetto (d.canale);
  // solo come ultima spiaggia ipotizziamo dalla piattaforma mittente.
  var canale    = d.canale
                  || ((d.piattaforma === 'booking' || d.piattaforma === 'kross') ? 'Booking' : 'Airbnb');
  var isBooking = canale === 'Booking';
  var cod       = d.codice || '';
  var notaPren  = d.prenotato ? 'Prenotato il ' + _ggmm(d.prenotato) + '. ' : '';
  var notaSogg  = d.checkin
    ? 'Check-in ' + _ggmm(d.checkin)
      + (d.checkout ? ', check-out ' + _ggmm(d.checkout) + (d.notti ? ' (' + d.notti + ' notti)' : '') : '')
      + '.'
    : '';
  var nota      = (notaPren + notaSogg).trim();
  // Marcatore di provenienza dell'importo: se viene da Kross (Booking/Diretta) lo
  // segnaliamo, così l'app mostra "da verificare". Airbnb = ufficiale = niente marcatore.
  var notaImp   = nota + (d.importo != null && d.importoFonte === 'kross' ? ' [importo: Kross]' : '');

  if (isHost) {
    // SCONTRINO — il giorno del check-in
    var id_sc = _idTask(cod, 'sc');
    if (!storico || !_esistePerCodice(cod + '_sc', id_sc)) {
      _salvaTask({
        id: id_sc, tipo: 'scontrino', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: d.checkin, codice: cod + '_sc',
        importo: d.importo || null, cohost: null, note: notaImp,
        completato: false, completato_il: null, completato_alle: null, creato_il: ora,
      });
      creati++;
    }
    // ALLOGGIATI — entro 24 ore dall'arrivo
    var id_al = _idTask(cod, 'al');
    if (!storico || !_esistePerCodice(cod + '_al', id_al)) {
      _salvaTask({
        id: id_al, tipo: 'alloggiati', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: _aggiungiGiorni(d.checkin, 1), codice: cod + '_al',
        importo: null, cohost: null, note: nota,
        completato: false, completato_il: null, completato_alle: null, creato_il: ora,
      });
      creati++;
    }
    // AUTOFATTURA TD17 — commissione Airbnb della prenotazione (SOLO case proprie).
    // La commissione ("Costi del servizio dell'host") la leggiamo dall'email Airbnb.
    // Data documento ≈ data prenotazione; scadenza = 15 del mese successivo.
    if (d.commissione) {
      var baseAf = d.prenotato || d.checkin;
      var dAf = new Date(baseAf + 'T12:00:00Z');
      var scadAf = new Date(Date.UTC(dAf.getUTCFullYear(), dAf.getUTCMonth() + 1, 15)).toISOString().slice(0, 10);
      var id_af = _idTask(cod, 'af');
      if (!storico || !_esistePerCodice(cod + '_af', id_af)) {
        _salvaTask({
          id: id_af, tipo: 'autofattura', casa: casa, ospite: d.ospite || '—',
          canale: canale, scadenza: scadAf, codice: cod + '_af',
          importo: d.commissione, cohost: null, data_doc: _ggmmaaaa(baseAf),
          note: 'Autofattura TD17 — commissione Airbnb ' + d.commissione.toFixed(2).replace('.', ',')
              + ' € (servizio host). ' + nota + ' Numero e data esatti dalla fattura IVA Airbnb del mese.',
          completato: false, completato_il: null, completato_alle: null, creato_il: ora,
        });
        creati++;
      }
    }
  } else {
    // FATTURA AL PROPRIETARIO
    var scadenza = isBooking ? _scadenzaBooking(d.checkout) : _aggiungiGiorni(d.checkin, 12);
    var id_fp = _idTask(cod, 'fp');
    if (!storico || !_esistePerCodice(cod, id_fp)) {
      _salvaTask({
        id: id_fp, tipo: 'fattura-pm', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: scadenza, codice: cod,
        importo: d.importo || null, cohost: d.compenso || null, note: notaImp,
        completato: false, completato_il: null, completato_alle: null, creato_il: ora,
      });
      creati++;
    }
    // ALLOGGIATI WEB — entro 24h dall'arrivo (anche per le case in gestione)
    var id_alg = _idTask(cod, 'al');
    if (!storico || !_esistePerCodice(cod + '_al', id_alg)) {
      _salvaTask({
        id: id_alg, tipo: 'alloggiati', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: _aggiungiGiorni(d.checkin, 1), codice: cod + '_al',
        importo: null, cohost: null, note: 'Comunicazione Alloggiati Web entro 24h dall\'arrivo. ' + nota,
        completato: false, completato_il: null, completato_alle: null, creato_il: ora,
      });
      creati++;
    }
  }

  return creati;
}

// ═══ SALVATAGGIO NEL DATABASE ═════════════════════════════════════════════════

function _db(percorso, opzioni) {
  return UrlFetchApp.fetch(CFG.SUPABASE_URL + '/rest/v1/' + percorso, {
    muteHttpExceptions: true,
    method: (opzioni && opzioni.metodo) || 'get',
    contentType: 'application/json',
    headers: {
      apikey: CFG.SUPABASE_KEY,
      Authorization: 'Bearer ' + CFG.SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: (opzioni && opzioni.prefer) || 'return=minimal',
    },
    payload: opzioni && opzioni.dati ? JSON.stringify(opzioni.dati) : undefined,
  });
}

function _salvaTask(task) {
  task.user_id = CFG.SUPABASE_USER_ID;
  var r = _db('tasks', {
    metodo: 'post',
    dati: task,
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  if (r.getResponseCode() >= 400) {
    // Lancia errore: così l'email viene etichettata "errore" e non "elaborata",
    // e potrà essere riprovata la volta successiva.
    throw new Error('DB: ' + r.getContentText().slice(0, 200));
  }
}

function _aggiornaCampo(id, campi) {
  _db('tasks?id=eq.' + encodeURIComponent(id), {
    metodo: 'patch',
    dati: campi,
  });
}

// Scrive il compenso co-host sulla fattura PM di una prenotazione, cercandola per
// CODICE (non per id calcolato) e solo dove il cohost è ancora vuoto. Così funziona
// a prescindere da come è stato creato il task e non sovrascrive correzioni manuali.
function _impostaCohostFattura(codice, compenso) {
  _db('tasks?codice=eq.' + encodeURIComponent(codice)
      + '&tipo=eq.fattura-pm'
      + '&user_id=eq.' + CFG.SUPABASE_USER_ID
      + '&cohost=is.null', {
    metodo: 'patch',
    dati: { cohost: compenso },
  });
  Logger.log('💶 Compenso co-host ' + compenso + ' € → fattura PM ' + codice + ' (se mancante)');
}

function _esiste(id) {
  try {
    return JSON.parse(
      _db('tasks?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1').getContentText()
    ).length > 0;
  } catch(e) { return false; }
}

function _esistePerCodice(codice, id) {
  if (_esiste(id)) return true;
  try {
    return JSON.parse(
      _db('tasks?codice=eq.' + encodeURIComponent(codice)
          + '&user_id=eq.' + CFG.SUPABASE_USER_ID + '&select=id&limit=1').getContentText()
    ).length > 0;
  } catch(e) { return false; }
}

function _annullaTask(codice) {
  var oggi = new Date().toISOString().slice(0, 10);
  var dati = { note: '❌ Prenotazione cancellata.', completato: true, completato_il: oggi };
  // Solo i task derivati da QUESTA prenotazione (scontrino, alloggiati, fattura PM).
  // NON facciamo un patch globale per codice: le autofatture IVA restano dovute.
  ['sc','al','fp'].forEach(function(s) { _aggiornaCampo(_idTask(codice, s), dati); });
}

// ═══ NOTIFICA PUSH ════════════════════════════════════════════════════════════

function _notifica(titolo, testo) {
  if (!CFG.PUSH_URL || !CFG.PUSH_SECRET) return;
  UrlFetchApp.fetch(CFG.PUSH_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CFG.PUSH_SECRET },
    payload: JSON.stringify({ title: titolo, body: testo }),
    muteHttpExceptions: true,
  });
}

// ═══ MAIL DI RECAP GIORNALIERO ════════════════════════════════════════════════
// Ogni mattina alle 7 ti arriva una email con le scadenze di oggi e domani.
// Usa la tua Gmail (gratis) e legge i task direttamente dal database.

var RECAP_TIPI = {
  scontrino:    '🧾 Scontrino',
  autofattura:  '📄 Autofattura',
  'fattura-pm': '💶 Fattura',
  alloggiati:   '🏛 Alloggiati',
  ross:         '📊 ROSS/ISTAT',
  manuale:      '✏️ Promemoria',
};

function _oggiISO(offset) {
  var d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM-dd');
}

function _taskInScadenza(date) {
  try {
    var q = 'tasks?select=tipo,casa,ospite,scadenza,note,importo'
      + '&completato=eq.false'
      + '&scadenza=in.(' + date.join(',') + ')'
      + '&user_id=eq.' + CFG.SUPABASE_USER_ID
      + '&order=scadenza';
    return JSON.parse(_db(q).getContentText()) || [];
  } catch (e) { Logger.log('Errore lettura task recap: ' + e); return []; }
}

var RECAP_COLORI = {
  scontrino:'#E11D48', autofattura:'#2563EB', 'fattura-pm':'#15803D',
  alloggiati:'#0E7490', ross:'#475569', manuale:'#6D28D9'
};
var RECAP_LABEL = {
  scontrino:'Scontrino', autofattura:'Autofattura', 'fattura-pm':'Fattura',
  alloggiati:'Alloggiati', ross:'ROSS/ISTAT', manuale:'Promemoria'
};

// Data ISO → "venerdì 20 giugno" (niente formato 2026-06-20 nelle mail)
function _dataLeggibile(iso) {
  var G = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  var M = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  var d = new Date(Date.UTC(+p[0], +p[1]-1, +p[2], 12));
  return G[d.getUTCDay()] + ' ' + (+p[2]) + ' ' + M[+p[1]-1];
}

// Riga task in HTML (etichetta colorata + casa/ospite + importo). Niente emoji:
// nelle email le emoji si corrompono, le lettere accentate e € no.
function _rigaTaskHTML(t) {
  var col = RECAP_COLORI[t.tipo] || '#475569';
  var lab = RECAP_LABEL[t.tipo] || t.tipo;
  var imp = t.importo ? '<span style="font-weight:700"> · ' + Number(t.importo).toFixed(2).replace('.', ',') + ' €</span>' : '';
  var chi = (t.casa || '—') + (t.ospite ? ' · ' + t.ospite : '');
  return '<tr><td style="padding:11px 0;border-bottom:1px solid #EFEFF2">'
    + '<span style="font-size:11px;font-weight:700;color:#ffffff;background:' + col + ';border-radius:6px;padding:3px 9px;text-transform:uppercase;letter-spacing:.03em">' + lab + '</span>'
    + '<div style="margin-top:6px;font-size:15px;color:#16181D">' + chi + imp + '</div>'
    + '</td></tr>';
}

function _rigaTaskPlain(t) {
  var lab = RECAP_LABEL[t.tipo] || t.tipo;
  var imp = t.importo ? ' - ' + Number(t.importo).toFixed(2).replace('.', ',') + ' EUR' : '';
  return '- ' + lab + ': ' + (t.casa || '-') + (t.ospite ? ' / ' + t.ospite : '') + imp;
}

/**
 * Inviata in automatico ogni mattina. Puoi eseguirla a mano per fare una prova.
 */
function inviaRecapGiornaliero() {
  var oggi = _oggiISO(0), domani = _oggiISO(1);
  var tasks = _taskInScadenza([oggi, domani]);
  var tOggi   = tasks.filter(function(t) { return t.scadenza === oggi; });
  var tDomani = tasks.filter(function(t) { return t.scadenza === domani; });

  var dest = CFG.RECAP_EMAIL || 'silvia.greco@gmail.com';
  var nOggi = tOggi.length;
  var oggetto = nOggi
    ? 'The Grape Escape - ' + nOggi + (nOggi === 1 ? ' cosa' : ' cose') + ' da fare oggi'
    : (tDomani.length ? 'The Grape Escape - scadenze di domani' : 'The Grape Escape - nessuna scadenza oggi');

  function sezione(arr, vuoto) {
    if (!arr.length) return '<p style="color:#9aa3af;font-size:14px;margin:4px 0 18px">' + vuoto + '</p>';
    return '<table width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 18px">' + arr.map(_rigaTaskHTML).join('') + '</table>';
  }
  function titoletto(txt) {
    return '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9aa3af;margin:18px 0 4px">' + txt + '</div>';
  }

  var url = CFG.APP_URL || 'https://grape-escape.vercel.app';
  var html =
    '<div style="background:#F4F5F7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:26px 24px">'
    + '<div style="font-size:22px;font-weight:800;color:#16181D">Buongiorno Silvia</div>'
    + '<div style="font-size:14px;color:#5B6470;margin-top:3px">' + _dataLeggibile(oggi)
      + ' · ' + (nOggi ? (nOggi + (nOggi === 1 ? ' cosa da fare' : ' cose da fare')) : 'nessuna scadenza oggi') + '</div>'
    + titoletto('Oggi') + sezione(tOggi, 'Niente in scadenza oggi.')
    + titoletto('Domani') + sezione(tDomani, 'Niente in scadenza domani.')
    + '<a href="' + url + '" style="display:inline-block;margin-top:8px;background:#FF385C;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">Apri l\'app</a>'
    + '</div></div>';

  var plain = 'Buongiorno Silvia - ' + _dataLeggibile(oggi) + '\n\nOggi:\n'
    + (tOggi.map(_rigaTaskPlain).join('\n') || 'nulla')
    + '\n\nDomani:\n' + (tDomani.map(_rigaTaskPlain).join('\n') || 'nulla')
    + '\n\n' + url;

  GmailApp.sendEmail(dest, oggetto, plain, { htmlBody: html, name: 'The Grape Escape' });
  Logger.log('Recap inviato a ' + dest + ' (' + nOggi + ' oggi, ' + tDomani.length + ' domani)');
}

// ═══ ETICHETTE GMAIL ══════════════════════════════════════════════════════════

function _getLabel(nome) {
  return GmailApp.getUserLabelByName(nome) || GmailApp.createLabel(nome);
}
function _haLabel(msg, nome) {
  var labels = msg.getThread().getLabels();
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].getName() === nome) return true;
  }
  return false;
}
function _mettiLabel(msg, nome) {
  msg.getThread().addLabel(_getLabel(nome));
}
