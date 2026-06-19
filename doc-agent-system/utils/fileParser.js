async function extractText(slackFileObject, slackClient) {
  const name = slackFileObject?.name || slackFileObject?.title || '';
  const fileType = slackFileObject?.filetype || name.split('.').pop();
  const supported = ['txt', 'md', 'markdown'];

  if (!supported.includes(String(fileType).toLowerCase())) {
    if (slackClient && slackFileObject?.channels?.[0] && slackFileObject?.user) {
      await slackClient.chat.postEphemeral({
        channel: slackFileObject.channels[0],
        user: slackFileObject.user,
        text: '⚠️ Unsupported file type. Please upload a .txt or .md PRD.'
      });
    }
    return null;
  }

  if (slackFileObject.content) {
    return slackFileObject.content;
  }

  const url = slackFileObject.url_private || slackFileObject.url_private_download;
  if (!url) return null;

  const fetch = (await import('node-fetch')).default;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download Slack file ${name}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

module.exports = { extractText };
