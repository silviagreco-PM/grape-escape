// api/daily-push.js — notifiche push mattutine (Vercel Cron)
// Eseguita ogni giorno alle 06:00 UTC (= 8:00 ora italiana d'estate) via vercel.json.
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const TIPO_LABEL = {
  scontrino:    '🧾 Scontrino',
  autofattura:  '📄 Autofattura',
  'fattura-pm': '💶 Fattura',
  alloggiati:   '🏛 Alloggiati',
  ross:         '📊 ROSS/ISTAT',
  manuale:      '✏️ Promemoria',
};

export default async function handler(req, res) {
  // Vercel Cron invia "Authorization: Bearer <CRON_SECRET>" se la variabile è impostata.
  // Se l'hai impostata, blocchiamo le chiamate non autorizzate; altrimenti lasciamo passare.
  if (process.env.CRON_SECRET) {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (auth !== process.env.CRON_SECRET) return res.status(401).send('Unauthorized');
  }

  const SUPA_URL      = process.env.SUPABASE_URL;
  const SUPA_SRV_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

  if (!SUPA_URL || !SUPA_SRV_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('Missing env vars');
    return res.status(500).send('Missing env vars');
  }

  webpush.setVapidDetails('mailto:silvia.greco@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);
  const sb = createClient(SUPA_URL, SUPA_SRV_KEY);

  // Data di oggi e domani (UTC, ora italiana è +1/+2)
  const now = new Date();
  const todayISO    = now.toISOString().slice(0, 10);
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  const tomorrowISO = tom.toISOString().slice(0, 10);

  // Task urgenti oggi + domani (tutti gli utenti, service role bypassa RLS)
  const { data: tasks } = await sb
    .from('tasks')
    .select('tipo, casa, ospite, scadenza')
    .eq('completato', false)
    .in('scadenza', [todayISO, tomorrowISO])
    .order('scadenza');

  if (!tasks?.length) { console.log('No tasks today/tomorrow'); return res.status(200).json({ sent: 0 }); }

  const oggi   = tasks.filter(t => t.scadenza === todayISO);
  const domani = tasks.filter(t => t.scadenza === tomorrowISO);

  const formatTask = t =>
    `${TIPO_LABEL[t.tipo] || t.tipo}: ${t.casa}${t.ospite ? ' · ' + t.ospite : ''}`;

  let title = oggi.length
    ? `📋 ${oggi.length} cosa${oggi.length > 1 ? 'e' : ''} da fare oggi`
    : `📋 ${domani.length} scadenz${domani.length > 1 ? 'e' : 'a'} domani`;

  let bodyLines = [];
  if (oggi.length)   bodyLines.push(...oggi.slice(0, 3).map(formatTask));
  if (domani.length && bodyLines.length < 3)
    bodyLines.push(`+ domani: ${domani.map(formatTask).slice(0, 2).join(', ')}`);
  const body = bodyLines.join('\n');

  const payload = JSON.stringify({
    title, body,
    url: '/',
    icon: '/icon.svg',
    badge: '/icon.svg',
  });

  // Tutte le subscription attive
  const { data: subs } = await sb.from('push_subscriptions').select('id, subscription');
  if (!subs?.length) { console.log('No subscriptions'); return res.status(200).json({ sent: 0 }); }

  let sent = 0, removed = 0;
  await Promise.allSettled(subs.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (err) {
      // 410 Gone = subscription scaduta → rimuovi
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sb.from('push_subscriptions').delete().eq('id', row.id);
        removed++;
      }
    }
  }));

  console.log(`Push: ${sent} sent, ${removed} removed`);
  return res.status(200).json({ sent, removed });
}
