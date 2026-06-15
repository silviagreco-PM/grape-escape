// ═══════════════════════════════════════════════════════════════════════════════
// The Grape Escape — Gmail Processor v1.0
// Monitora Gmail per email Airbnb / Booking / Kross
// Crea task automaticamente in Supabase e invia notifiche push
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURAZIONE (Progetto → Proprietà script) ───────────────────────────────
// SUPABASE_URL          → https://vjurwiqeiummanltsdtt.supabase.co
// SUPABASE_SERVICE_KEY  → chiave service_role (Settings > API)
// SUPABASE_USER_ID      → UUID di Silvia (Authentication > Users)
// CLAUDE_API_KEY        → chiave Anthropic (console.anthropic.com)
// PUSH_ENDPOINT         → https://thegrapeescape.netlify.app/.netlify/functions/send-push
// PUSH_SECRET           → stringa casuale (stessa in Netlify env)

const P = PropertiesService.getScriptProperties().getProperties();

const LABEL_OK  = 'grape-escape/ok';
const LABEL_ERR = 'grape-escape/errore';

// Mapping nome annuncio (lowercase, match parziale) → nome casa nell'app
const LISTING_MAP = [
  ['ciucarina',            "La Ciucarina"],
  ['boutique house',       "La Ciucarina"],
  ["ca' balenga",          "Ca' Balenga"],
  ['balenga',              "Ca' Balenga"],
  ['tana del tasso',       "La Tana del Tasso"],
  ['authentic monferrato', "La Tana del Tasso"],
  ['palio',                "Appartamento del Palio"],
  ['casa amalia',          "Casa Amalia"],
  ['amalia monferrato',    "Casa Amalia"],
  ['omede',                "Villa Omedè"],     // senza accento
  ['omedè',                "Villa Omedè"],
  ['dimora storica',       "Villa Omedè"],
  ['con piscina',          "Villa Omedè"],
  ['tenuta del mulino',    "Tenuta del Mulino"],
  ['villa indipendente',   "Tenuta del Mulino"],
  ['mulino',               "Tenuta del Mulino"],
  ['castellero',           "Castellero (Nocciole)"],
];

const CASE_HOST = ["Ca' Balenga", "La Ciucarina"];

// ═══ ENTRY POINTS ═════════════════════════════════════════════════════════════

/** Esegui UNA VOLTA: imposta il trigger automatico ogni 5 minuti */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processNewEmails').timeBased().everyMinutes(5).create();
  Logger.log('✅ Trigger impostato: processNewEmails ogni 5 minuti');
}

/** Esegui UNA VOLTA: recupera tutte le email storiche non ancora elaborate */
function backfillEmails() {
  Logger.log('🔄 Backfill in corso...');
  _run('from:(airbnb.com OR booking.com OR kross) -label:' + LABEL_OK, true);
  Logger.log('✅ Backfill completato');
}

/** Chiamato automaticamente ogni 5 minuti */
function processNewEmails() {
  _run('from:(airbnb.com OR booking.com OR kross) -label:' + LABEL_OK + ' newer_than:3d', false);
}

// ═══ CORE ═════════════════════════════════════════════════════════════════════

function _run(query, isBackfill) {
  const threads = GmailApp.search(query, 0, 100);
  let newTasks = 0;

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (_hasLabel(msg, LABEL_OK)) continue;
      try {
        newTasks += _processMsg(msg, isBackfill);
        _addLabel(msg, LABEL_OK);
      } catch (e) {
        Logger.log('❌ "' + msg.getSubject() + '": ' + e);
        _addLabel(msg, LABEL_ERR);
      }
    }
  }

  if (newTasks > 0) {
    _notify(
      '📋 ' + newTasks + (newTasks === 1 ? ' nuovo task aggiunto' : ' nuovi task aggiunti'),
      'Aggiornamento da Airbnb / Booking / Kross — apri l\'app per vedere.'
    );
    Logger.log('✅ ' + newTasks + ' task creati');
  }
}

function _processMsg(msg, isBackfill) {
  const from     = msg.getFrom().toLowerCase();
  const platform = from.includes('airbnb') ? 'airbnb'
                 : from.includes('booking') ? 'booking'
                 : from.includes('kross')   ? 'kross'
                 : null;
  if (!platform) return 0;

  const parsed = _parse(
    msg.getSubject(),
    msg.getPlainBody().slice(0, 4000),
    platform,
    msg.getDate()
  );
  if (!parsed || parsed.event_type === 'altro') return 0;

  Logger.log('📨 ' + platform + ' · ' + parsed.event_type
    + ' · ' + (parsed.listing_name || '—')
    + ' · ' + (parsed.guest_name   || '—'));

  return _createTasks(parsed, isBackfill);
}

// ═══ PARSING CON CLAUDE HAIKU ════════════════════════════════════════════════

function _parse(subject, body, platform, date) {
  if (!P.CLAUDE_API_KEY) return _parseFallback(subject, body, platform);

  const prompt =
    'Sei un assistente che estrae dati strutturati da email per una property manager italiana.\n'
    + 'Analizza questa email di ' + platform.toUpperCase() + ' e rispondi SOLO con JSON valido.\n\n'
    + '{\n'
    + '  "event_type": "prenotazione"|"cancellazione"|"modifica"|"pagamento_cohost"|"autofattura_iva"|"altro",\n'
    + '  "listing_name": string|null,\n'
    + '  "guest_name": string|null,\n'
    + '  "checkin": "YYYY-MM-DD"|null,\n'
    + '  "checkout": "YYYY-MM-DD"|null,\n'
    + '  "nights": number|null,\n'
    + '  "reservation_code": string|null,\n'
    + '  "amount_gross": number|null,\n'
    + '  "amount_payout": number|null,\n'
    + '  "invoice_month": "YYYY-MM"|null\n'
    + '}\n\n'
    + 'Anno di riferimento: ' + date.getFullYear() + '. Solo JSON, nessun altro testo.\n\n'
    + 'OGGETTO: ' + subject + '\n---\n' + body;

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': P.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    Logger.log('Claude ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    return _parseFallback(subject, body, platform);
  }

  try {
    const text = JSON.parse(res.getContentText()).content[0].text;
    const m    = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    parsed.platform = platform;
    return parsed;
  } catch (e) {
    Logger.log('JSON parse error: ' + e);
    return _parseFallback(subject, body, platform);
  }
}

// Fallback regex per i casi più comuni senza Claude API
function _parseFallback(subject, body, platform) {
  const s = subject.toLowerCase();
  const b = body.toLowerCase();
  const result = { platform, event_type: 'altro', listing_name: null, guest_name: null,
                   checkin: null, checkout: null, nights: null, reservation_code: null,
                   amount_gross: null, amount_payout: null, invoice_month: null };

  if (s.includes('cancell')) { result.event_type = 'cancellazione'; }
  else if (s.includes('prenotaz') || s.includes('booking confirm') || s.includes('new reserv')) {
    result.event_type = 'prenotazione';
  } else if (s.includes('pagamento') || s.includes('payout') || s.includes('guadagno')) {
    result.event_type = 'pagamento_cohost';
  } else if (s.includes('fattura') || s.includes('invoice')) {
    result.event_type = 'autofattura_iva';
  }

  // Codice prenotazione Airbnb (es. HMKANPNZFF)
  const codeAirbnb = body.match(/\b(HM[A-Z0-9]{6,10})\b/);
  if (codeAirbnb) result.reservation_code = codeAirbnb[1];

  // Codice prenotazione Booking (es. 3501655314)
  const codeBook = body.match(/\b(\d{10})\b/);
  if (codeBook && platform === 'booking') result.reservation_code = codeBook[1];

  // Date nel formato GG/MM/AAAA
  const dates = [...body.matchAll(/(\d{1,2})\/(\d{2})\/(\d{4})/g)].map(m =>
    m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0'));
  if (dates.length >= 2) { result.checkin = dates[0]; result.checkout = dates[1]; }

  return result;
}

// ═══ CREAZIONE TASK ═══════════════════════════════════════════════════════════

function _resolveCasa(name) {
  if (!name) return null;
  const lower = name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // rimuove accenti
  for (const [kw, casa] of LISTING_MAP) {
    const kwNorm = kw.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (lower.includes(kwNorm)) return casa;
  }
  return null;
}

function _addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function _bookingScadenza(checkout) {
  // Booking paga ~3 del mese dopo il checkout; scadenza fiscale = payout + 12 gg
  if (!checkout) return null;
  const d = new Date(checkout + 'T12:00:00Z');
  const payout = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 3));
  return _addDays(payout.toISOString().slice(0, 10), 12);
}

// ID deterministico basato sul codice prenotazione → previene duplicati
function _taskId(code, suffix) {
  return ('gas_' + (code || 'noc') + '_' + suffix)
    .replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 50);
}

function _createTasks(p, isBackfill) {
  const now  = new Date().toISOString();
  const casa = _resolveCasa(p.listing_name);
  let created = 0;

  // ── CANCELLAZIONE ──
  if (p.event_type === 'cancellazione') {
    if (p.reservation_code) _cancelTasks(p.reservation_code);
    return 0;
  }

  // ── PAGAMENTO CO-HOST — aggiorna importo su fattura-pm esistente ──
  if (p.event_type === 'pagamento_cohost') {
    if (p.reservation_code && p.amount_payout)
      _patchTask(_taskId(p.reservation_code, 'fp'), { cohost: p.amount_payout });
    return 0;
  }

  // ── AUTOFATTURA IVA (TD17) ──
  if (p.event_type === 'autofattura_iva' && p.invoice_month) {
    const [y, m] = p.invoice_month.split('-').map(Number);
    const scadenza = new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
    const id = _taskId('af_' + p.invoice_month, 'af');
    if (!isBackfill || !_exists(id)) {
      _insert({
        id, tipo: 'autofattura', casa: casa || '—',
        ospite: 'Autofattura ' + p.invoice_month, canale: 'Airbnb',
        scadenza, codice: 'af_' + p.invoice_month,
        importo: p.amount_payout || null, cohost: null,
        note: 'IVA commissioni Airbnb ' + p.invoice_month + ' — emetti TD17 entro il 15.',
        completato: false, completatoIl: null, completatoAlle: null, creatoIl: now,
      });
      created++;
    }
    return created;
  }

  // ── PRENOTAZIONE / MODIFICA ──
  if (!['prenotazione', 'modifica'].includes(p.event_type)) return 0;
  if (!p.checkin) { Logger.log('⚠ No checkin date, skip'); return 0; }
  if (!casa)      { Logger.log('⚠ Unknown listing: ' + p.listing_name + ' — skip'); return 0; }

  const isHost    = CASE_HOST.includes(casa);
  const isBooking = ['booking', 'kross'].includes(p.platform);
  const canale    = isBooking ? 'Booking' : 'Airbnb';
  const code      = p.reservation_code || '';
  const noteBase  = p.checkin && p.checkout
    ? 'Check-in ' + p.checkin + ', check-out ' + p.checkout
      + (p.nights ? ' (' + p.nights + ' notti).' : '.')
    : '';

  if (isHost) {
    // SCONTRINO — giorno del check-in
    const sc = _taskId(code, 'sc');
    if (!isBackfill || !_existsByCode(code + '_sc', sc)) {
      _insert({
        id: sc, tipo: 'scontrino', casa, ospite: p.guest_name || '—',
        canale, scadenza: p.checkin, codice: code + '_sc',
        importo: p.amount_gross || null, cohost: null, note: noteBase,
        completato: false, completatoIl: null, completatoAlle: null, creatoIl: now,
      });
      created++;
    }
    // ALLOGGIATI — entro 24h dall'arrivo
    const al = _taskId(code, 'al');
    if (!isBackfill || !_existsByCode(code + '_al', al)) {
      _insert({
        id: al, tipo: 'alloggiati', casa, ospite: p.guest_name || '—',
        canale, scadenza: p.checkin, codice: code + '_al',
        importo: null, cohost: null, note: noteBase,
        completato: false, completatoIl: null, completatoAlle: null, creatoIl: now,
      });
      created++;
    }
  } else {
    // FATTURA PM
    const scadenza = isBooking ? _bookingScadenza(p.checkout) : _addDays(p.checkin, 12);
    const fp = _taskId(code, 'fp');
    if (!isBackfill || !_existsByCode(code, fp)) {
      _insert({
        id: fp, tipo: 'fattura-pm', casa, ospite: p.guest_name || '—',
        canale, scadenza, codice: code,
        importo: p.amount_gross || null, cohost: p.amount_payout || null,
        note: noteBase,
        completato: false, completatoIl: null, completatoAlle: null, creatoIl: now,
      });
      created++;
    }
  }

  return created;
}

// ═══ SUPABASE ════════════════════════════════════════════════════════════════

function _sb(path, opts) {
  return UrlFetchApp.fetch(P.SUPABASE_URL + '/rest/v1/' + path, {
    muteHttpExceptions: true,
    ...opts,
    headers: {
      apikey: P.SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + P.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts && opts.headers || {}),
    },
  });
}

function _insert(task) {
  task.user_id = P.SUPABASE_USER_ID;
  const r = _sb('tasks', {
    method: 'post',
    payload: JSON.stringify(task),
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });
  if (r.getResponseCode() >= 400) Logger.log('Supabase insert error: ' + r.getContentText());
}

function _patchTask(id, fields) {
  _sb('tasks?id=eq.' + encodeURIComponent(id), {
    method: 'patch',
    payload: JSON.stringify(fields),
    headers: { Prefer: 'return=minimal' },
  });
}

// Controlla esistenza per id (task creati da questo script)
function _exists(id) {
  try {
    return JSON.parse(
      _sb('tasks?id=eq.' + encodeURIComponent(id) + '&select=id&limit=1').getContentText()
    ).length > 0;
  } catch { return false; }
}

// Controlla esistenza per codice (task creati manualmente) O per id
function _existsByCode(codice, id) {
  if (_exists(id)) return true;
  try {
    return JSON.parse(
      _sb('tasks?codice=eq.' + encodeURIComponent(codice)
          + '&user_id=eq.' + P.SUPABASE_USER_ID + '&select=id&limit=1').getContentText()
    ).length > 0;
  } catch { return false; }
}

function _cancelTasks(code) {
  const today = new Date().toISOString().slice(0, 10);
  const nota  = { note: '❌ Prenotazione cancellata.', completato: true, completatoIl: today };
  // Task creati dallo script
  ['sc', 'al', 'fp'].forEach(s => _patchTask(_taskId(code, s), nota));
  // Task creati manualmente con lo stesso codice
  _sb('tasks?codice=eq.' + encodeURIComponent(code) + '&user_id=eq.' + P.SUPABASE_USER_ID, {
    method: 'patch',
    payload: JSON.stringify(nota),
    headers: { Prefer: 'return=minimal' },
  });
}

// ═══ PUSH NOTIFICATION ═══════════════════════════════════════════════════════

function _notify(title, body) {
  if (!P.PUSH_ENDPOINT || !P.PUSH_SECRET) return;
  UrlFetchApp.fetch(P.PUSH_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + P.PUSH_SECRET },
    payload: JSON.stringify({ title, body }),
    muteHttpExceptions: true,
  });
}

// ═══ GMAIL LABELS ════════════════════════════════════════════════════════════

function _getLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
function _hasLabel(msg, name) {
  return msg.getThread().getLabels().some(l => l.getName() === name);
}
function _addLabel(msg, name) {
  msg.getThread().addLabel(_getLabel(name));
}
