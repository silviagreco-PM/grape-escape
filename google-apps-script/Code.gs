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
  Logger.log('✅ Fatto! Controllo email ogni 5 minuti + mail di recap ogni mattina alle 7.');
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
}

// ═══ ELABORAZIONE EMAIL ═══════════════════════════════════════════════════════

function _elabora(ricerca, storico) {
  var discussioni = GmailApp.search(ricerca, 0, 100);
  var taskNuovi = 0;

  for (var i = 0; i < discussioni.length; i++) {
    var messaggi = discussioni[i].getMessages();
    for (var j = 0; j < messaggi.length; j++) {
      var msg = messaggi[j];
      if (_haLabel(msg, LABEL_OK)) continue;
      try {
        taskNuovi += _leggiEmail(msg, storico);
        _mettiLabel(msg, LABEL_OK);
      } catch(e) {
        Logger.log('❌ Errore: ' + msg.getSubject() + ' — ' + e);
        _mettiLabel(msg, LABEL_ERR);
      }
    }
  }

  if (taskNuovi > 0) {
    _notifica(
      '📋 ' + taskNuovi + (taskNuovi === 1 ? ' nuovo task aggiunto' : ' nuovi task aggiunti'),
      'Aggiornamento da Airbnb/Booking/Kross — apri l\'app per vedere.'
    );
    Logger.log('✅ Creati ' + taskNuovi + ' task nuovi');
  }
}

function _leggiEmail(msg, storico) {
  var mittente = msg.getFrom().toLowerCase();
  var piattaforma = mittente.indexOf('airbnb') >= 0  ? 'airbnb'
                  : mittente.indexOf('booking') >= 0 ? 'booking'
                  : mittente.indexOf('kross') >= 0   ? 'kross'
                  : null;
  if (!piattaforma) return 0;

  var dati = _analizzaEmail(msg.getSubject(), msg.getPlainBody(), piattaforma, msg.getDate());
  if (!dati || dati.tipo === 'altro') {
    Logger.log('⏭ Tipo non riconosciuto — oggetto: ' + msg.getSubject().slice(0, 80));
    return 0;
  }

  Logger.log('📨 ' + piattaforma + ' · ' + dati.tipo
    + ' · ' + (dati.casa || '—') + ' · ' + (dati.ospite || '—'));

  return _creaTask(dati, storico);
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
    compenso: null,
    mese_fattura: null
  };

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

  // Nome ospite (cerca pattern comuni)
  var patOspite = [
    /ospite:\s*([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+)/i,
    /guest:\s*([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+)/i,
    /nome:\s*([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+)/i,
    /prenotazione di ([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+)/i,
    /([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+) ha prenotato/i,
    /([A-Z][a-zÀ-ú]+ [A-Z][a-zÀ-ú]+) has requested/i,
  ];
  for (var p = 0; p < patOspite.length; p++) {
    var m2 = testo.match(patOspite[p]);
    if (m2 && m2[1]) { dati.ospite = m2[1]; break; }
  }

  // Importo (cerca simbolo € o EUR)
  var importi = [];
  var regImporto = /(?:EUR|€)\s*([0-9.,]+)/gi;
  while ((match = regImporto.exec(testo)) !== null) {
    var n = parseFloat(match[1].replace(/\./g,'').replace(',','.'));
    if (!isNaN(n) && n > 0) importi.push(n);
  }
  if (importi.length > 0) dati.compenso = Math.max.apply(null, importi);

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
    // Canale OTA reale dal soggetto ("Nuova Prenotazione Airbnb / Booking.com")
    if (/booking\.com/i.test(oggetto))   dati.canale = 'Booking';
    else if (/airbnb/i.test(oggetto))    dati.canale = 'Airbnb';

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

    // Importo ospite: "Totale tariffa: Euro 412,43"
    var mTot = corpo.match(/totale tariffa:\s*(?:euro|eur|€)\s*([0-9.,]+)/i);
    if (mTot) {
      var nTot = parseFloat(mTot[1].replace(/\./g,'').replace(',','.'));
      if (!isNaN(nTot) && nTot > 0) dati.importo = nTot;
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

  // PAGAMENTO: aggiorna l'importo sulla fattura esistente
  if (d.tipo === 'pagamento') {
    if (d.codice && d.compenso) {
      _aggiornaCampo(_idTask(d.codice, 'fp'), { cohost: d.compenso });
    }
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
  if (!d.checkin) { Logger.log('⚠ Nessuna data check-in trovata'); return 0; }
  if (!casa) {
    Logger.log('⚠ Nome annuncio non riconosciuto: ' + (d.casa || '—'));
    return 0;
  }

  var isHost    = CASE_HOST.indexOf(casa) >= 0;
  // Canale OTA reale: per le email Kross lo leggiamo dal soggetto (d.canale);
  // solo come ultima spiaggia ipotizziamo dalla piattaforma mittente.
  var canale    = d.canale
                  || ((d.piattaforma === 'booking' || d.piattaforma === 'kross') ? 'Booking' : 'Airbnb');
  var isBooking = canale === 'Booking';
  var cod       = d.codice || '';
  var nota      = d.checkin && d.checkout
    ? 'Check-in ' + _ggmm(d.checkin) + ', check-out ' + _ggmm(d.checkout)
      + (d.notti ? ' (' + d.notti + ' notti).' : '.')
    : '';

  if (isHost) {
    // SCONTRINO — il giorno del check-in
    var id_sc = _idTask(cod, 'sc');
    if (!storico || !_esistePerCodice(cod + '_sc', id_sc)) {
      _salvaTask({
        id: id_sc, tipo: 'scontrino', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: d.checkin, codice: cod + '_sc',
        importo: d.importo || null, cohost: null, note: nota,
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
  } else {
    // FATTURA AL PROPRIETARIO
    var scadenza = isBooking ? _scadenzaBooking(d.checkout) : _aggiungiGiorni(d.checkin, 12);
    var id_fp = _idTask(cod, 'fp');
    if (!storico || !_esistePerCodice(cod, id_fp)) {
      _salvaTask({
        id: id_fp, tipo: 'fattura-pm', casa: casa, ospite: d.ospite || '—',
        canale: canale, scadenza: scadenza, codice: cod,
        importo: d.importo || null, cohost: d.compenso || null, note: nota,
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
  'fattura-pm': '💶 Fattura PM',
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
  scontrino:'Scontrino', autofattura:'Autofattura', 'fattura-pm':'Fattura PM',
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
