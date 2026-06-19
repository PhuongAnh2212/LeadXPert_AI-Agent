let slackClient = null;

function configureSlack(client) {
  slackClient = client;
}

async function postMessage(channel, text) {
  if (!slackClient) {
    console.log(`[Slack message:${channel}] ${text}`);
    return { ok: true, ts: String(Date.now() / 1000) };
  }
  return slackClient.chat.postMessage({ channel, text });
}

async function postReply(channel, threadTs, text) {
  if (!slackClient) {
    console.log(`[Slack reply:${channel}:${threadTs}] ${text}`);
    return { ok: true, ts: String(Date.now() / 1000) };
  }
  return slackClient.chat.postMessage({ channel, thread_ts: threadTs, text });
}

async function postEphemeral(channel, userId, text) {
  if (!slackClient) {
    console.log(`[Slack ephemeral:${channel}:${userId}] ${text}`);
    return { ok: true };
  }
  return slackClient.chat.postEphemeral({ channel, user: userId, text });
}

async function listenThread(channel, threadTs) {
  if (!slackClient) return [];
  const response = await slackClient.conversations.replies({ channel, ts: threadTs, limit: 50 });
  return response.messages || [];
}

module.exports = { configureSlack, postMessage, postReply, postEphemeral, listenThread };
