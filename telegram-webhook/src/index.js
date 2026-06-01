export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Verify webhook secret in URL path
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
    const text = message.text.trim();

    if (text === '/digest' || text === '/digest@' + (await getBotUsername(env))) {
      // Trigger GitHub Actions workflow
      const ghRes = await fetch(
        'https://api.github.com/repos/is-yu/follow-builders/actions/workflows/daily-digest.yml/dispatches',
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

      if (ghRes.status === 204) {
        await sendTelegramMessage(env, chatId, '⏳ Digest is being prepared. It will arrive in about 1 minute.');
      } else {
        const err = await ghRes.text();
        await sendTelegramMessage(env, chatId, `Failed to trigger digest: ${ghRes.status} ${err}`);
      }
    }

    return new Response('OK');
  },
};

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
