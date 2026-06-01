const WORKFLOWS = {
  digest: { repo: 'is-yu/follow-builders', file: 'daily-digest.yml', label: 'AI Builders Digest' },
  signals: { repo: 'is-yu/ai-visionary', file: 'daily-signals.yml', label: 'AI Signals' },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== `/${env.WEBHOOK_SECRET}`) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('OK');
    }

    const update = await request.json();
    const message = update.message;
    if (!message || !message.text) {
      return new Response('OK');
    }

    const chatId = message.chat.id.toString();
    const text = message.text.trim().split('@')[0]; // strip @botname suffix

    let toTrigger = [];
    if (text === '/digest') toTrigger = ['digest'];
    else if (text === '/signals') toTrigger = ['signals'];
    else if (text === '/all') toTrigger = ['digest', 'signals'];

    if (toTrigger.length === 0) return new Response('OK');

    const results = await Promise.all(toTrigger.map(key => triggerWorkflow(env, WORKFLOWS[key])));
    const succeeded = results.filter(r => r.ok).map(r => r.label);
    const failed = results.filter(r => !r.ok).map(r => `${r.label}: ${r.error}`);

    let reply = '';
    if (succeeded.length) reply += `⏳ Preparing: ${succeeded.join(', ')}. Arriving in ~1 min.`;
    if (failed.length) reply += `\n❌ Failed: ${failed.join('; ')}`;

    await sendTelegramMessage(env, chatId, reply.trim());
    return new Response('OK');
  },
};

async function triggerWorkflow(env, { repo, file, label }) {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${file}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_PAT}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'follow-builders-telegram-webhook',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );
  if (res.status === 204) return { ok: true, label };
  const err = await res.text();
  return { ok: false, label, error: `${res.status} ${err}` };
}

async function sendTelegramMessage(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function getBotUsername(env) {
  // Cache-friendly: bot username doesn't change
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await res.json();
  return data.result?.username || '';
}
