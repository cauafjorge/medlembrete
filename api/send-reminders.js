/* Envia os lembretes push que estão no horário. Chamada a cada minuto por um agendador externo.
   Lê a coleção `push` (um documento por usuário, escrito pelo próprio app) e envia via Firebase Cloud Messaging. */
const pad = n => String(n).padStart(2, '0');

function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } };

/* Núcleo testável: recebe o banco, o serviço de mensagens e as operações de campo do Firestore. */
async function run({ db, messaging, FieldValue, now = new Date(), windowMinutes = 3 }) {
  const wins = Array.from({ length: windowMinutes }, (_, i) => new Date(now.getTime() - i * 60000));
  const utcMins = wins.map(d => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
  const snap = await db.collection('push').where('utcTimes', 'array-contains-any', utcMins).get();
  const out = { users: snap.size, sent: 0, skipped: 0, removedTokens: 0 };
  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const tokens = Array.isArray(d.tokens) ? d.tokens.filter(t => typeof t === 'string').slice(0, 10) : [];
    if (!d.enabled || !tokens.length) { out.skipped++; continue; }
    const tz = validTz(d.tz) ? d.tz : 'America/Sao_Paulo';
    const done = new Set([...(d.taken || []), ...(d.sentKeys || [])]);
    const due = [];
    for (const w of wins) {
      const lp = localParts(w, tz);
      for (const m of Array.isArray(d.meds) ? d.meds : []) {
        if (!m || !Array.isArray(m.times) || !m.times.includes(lp.hm)) continue;
        if (m.createdAt && lp.date < m.createdAt) continue;
        const id = `${lp.date}|${m.id}|${lp.hm}`;
        if (done.has(id)) continue;
        done.add(id);
        due.push({ id, m, hm: lp.hm });
      }
    }
    if (!due.length) continue;
    // marca como enviado antes de enviar, para não duplicar se a função rodar duas vezes
    await doc.ref.update({ sentKeys: [...(d.sentKeys || []), ...due.map(x => x.id)].slice(-120) });
    const bad = new Set();
    for (const x of due) {
      const who = x.m.who ? ` (${String(x.m.who).slice(0, 40)})` : '';
      const res = await messaging.sendEachForMulticast({
        tokens,
        data: { title: `Hora de ${String(x.m.name || 'seu remédio').slice(0, 80)}${who}`, body: `${String(x.m.dose || '').slice(0, 80)} · ${x.hm}`.trim(), tag: x.id },
        webpush: { headers: { Urgency: 'high', TTL: '900' } },
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } }
      });
      res.responses.forEach((r, i) => {
        if (r.success) return;
        const c = r.error?.code || '';
        if (c.includes('registration-token-not-registered') || c.includes('invalid-registration-token') || c.includes('invalid-argument')) bad.add(tokens[i]);
      });
      out.sent += res.successCount;
    }
    if (bad.size) { await doc.ref.update({ tokens: FieldValue.arrayRemove(...bad) }); out.removedTokens += bad.size; }
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.query?.key !== secret) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT não configurada' });
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    const out = await run({ db: admin.firestore(), messaging: admin.messaging(), FieldValue: admin.firestore.FieldValue });
    console.log(JSON.stringify({ run: new Date().toISOString(), ...out }));
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'falha ao enviar' });
  }
};
module.exports.run = run;
