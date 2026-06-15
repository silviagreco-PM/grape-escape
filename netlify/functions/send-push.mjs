// send-push.mjs — endpoint HTTP per inviare notifiche push dall'esterno
// Chiamato dal Google Apps Script ogni volta che crea task nuovi
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const auth = (event.headers.authorization || '').replace('Bearer ', '');
  if (!auth || auth !== process.env.PUSH_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let title, body, url;
  try {
    ({ title, body, url } = JSON.parse(event.body || '{}'));
  } catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  if (!title) return { statusCode: 400, body: 'Missing title' };

  webpush.setVapidDetails(
    'mailto:silvia.greco@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: subs } = await sb.from('push_subscriptions').select('id, subscription');
  if (!subs?.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

  const payload = JSON.stringify({
    title,
    body: body || '',
    url: url || 'https://thegrapeescape.netlify.app',
    icon: '/icon.svg',
    badge: '/icon.svg',
  });

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

  console.log(`send-push: ${sent} sent, ${removed} removed`);
  return { statusCode: 200, body: JSON.stringify({ sent, removed }) };
};
