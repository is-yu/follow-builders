#!/usr/bin/env node

// Reads feed JSON from stdin (output of prepare-digest.js),
// calls Claude Haiku to remix it into a polished digest,
// and outputs plain text to stdout.

import Anthropic from '@anthropic-ai/sdk';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const feed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  if (feed.stats.podcastEpisodes === 0 && feed.stats.xBuilders === 0) {
    console.log('No new updates from your builders today. Check back tomorrow!');
    return;
  }

  const language = feed.config?.language || 'en';
  const prompts = feed.prompts;

  const systemPrompt = [
    prompts.digest_intro,
    prompts.summarize_tweets,
    prompts.summarize_podcast,
    language === 'zh' || language === 'bilingual' ? prompts.translate : ''
  ].filter(Boolean).join('\n\n---\n\n');

  const contentSections = [];

  if (feed.x && feed.x.length > 0) {
    contentSections.push('## X/Twitter Data\n\n' + JSON.stringify(feed.x, null, 2));
  }

  if (feed.podcasts && feed.podcasts.length > 0) {
    const podcastData = feed.podcasts.map(p => ({
      name: p.name,
      title: p.title,
      url: p.url,
      transcript: p.transcript
    }));
    contentSections.push('## Podcast Data\n\n' + JSON.stringify(podcastData, null, 2));
  }

  const userMessage = `Please produce today's AI Builders Digest using the data below. Language setting: ${language}.

${contentSections.join('\n\n')}`;

  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  const digest = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  console.log(digest);
}

main().catch(err => {
  console.error('remix-digest error:', err.message);
  process.exit(1);
});
