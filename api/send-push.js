// Vercel API route — riceve la chiamata dal Google Apps Script e manda la notifica push
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC = 'BG5OAo4FCzOjlEXg5SCRI82AuY5rixGpGZBU5f_1ydR8-qbGRmhvUtkx1MumDe4e_wPGGxVccODnQEpYklagpUA';
const toUrlSafe = (k) => (k || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth || auth !== process.env.PUSH_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  const { title, body, url } = req.body || {};
  if (!title) return res.status(400).send('Missing title');

  webpush.setVapidDetails(
    'mailto:silvia.greco@gmail.com',
    VAPID_PUBLIC,
    toUrlSafe(process.env.VAPID_PRIVATE_KEY),
  );

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: subs } = await sb.from('push_subscriptions').select('id, subscription');
  if (!subs?.length) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({
    title,
    body: body || '',
    url: url || 'https://grape-escape.vercel.app',
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
  return res.status(200).json({ sent, removed });
}
