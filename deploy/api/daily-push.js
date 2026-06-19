// Vercel API route — notifica push mattutina (8:00 ora italiana)
// Invocata automaticamente dal cron di Vercel ogni giorno alle 6:00 UTC = 8:00 CEST
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

  // Data in ora italiana (Europe/Rome), non UTC
  const romeDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const now = new Date();
  const todayISO    = romeDate(now);
  const tom = new Date(now); tom.setDate(tom.getDate() + 1);
  const tomorrowISO = romeDate(tom);

  const { data: tasks } = await sb
    .from('tasks')
    .select('tipo, casa, ospite, scadenza')
    .eq('completato', false)
    .in('scadenza', [todayISO, tomorrowISO])
    .order('scadenza');

  if (!tasks?.length) {
    console.log('No tasks today/tomorrow');
    return res.status(200).send('No tasks');
  }

  const oggi   = tasks.filter(t => t.scadenza === todayISO);
  const domani = tasks.filter(t => t.scadenza === tomorrowISO);

  const formatTask = t =>
    `${TIPO_LABEL[t.tipo] || t.tipo}: ${t.casa || '—'}${t.ospite ? ' · ' + t.ospite : ''}`;

  const title = oggi.length
    ? `📋 ${oggi.length} cosa${oggi.length > 1 ? 'e' : ''} da fare oggi`
    : `📋 ${domani.length} scadenz${domani.length > 1 ? 'e' : 'a'} domani`;

  const bodyLines = [];
  if (oggi.length)   bodyLines.push(...oggi.slice(0, 3).map(formatTask));
  if (domani.length && bodyLines.length < 3)
    bodyLines.push(`+ domani: ${domani.map(formatTask).slice(0, 2).join(', ')}`);

  const payload = JSON.stringify({
    title,
    body: bodyLines.join('\n'),
    url: 'https://grape-escape.vercel.app',
    icon: '/icon.svg',
    badge: '/icon.svg',
  });

  const { data: subs } = await sb.from('push_subscriptions').select('id, subscription');
  if (!subs?.length) {
    console.log('No subscriptions');
    return res.status(200).send('No subscriptions');
  }

  let sent = 0, removed = 0;
  await Promise.allSettled(subs.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sb.from('push_subscriptions').delete().eq('id', row.id);
        removed++;
      }
    }
  }));

  console.log(`Push: ${sent} sent, ${removed} removed`);
  return res.status(200).json({ sent, removed });
}
