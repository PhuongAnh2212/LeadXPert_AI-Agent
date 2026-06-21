require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { createSystem } = require('./index');
const { SlackAdapter, parseCommandBody } = require('./adapters/mockSlack');

function verifySlackSignature(signingSecret, timestamp, signature, rawBody, now = Date.now()) {
  if (!signingSecret || !timestamp || !signature || !rawBody) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 60 * 5) return false;
  const expected = `v0=${crypto.createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  const left = Buffer.from(expected); const right = Buffer.from(signature);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signatureMiddleware(signingSecret) {
  return (req, res, next) => {
    const raw = req.body?.toString('utf8') || '';
    const valid = verifySlackSignature(signingSecret, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'], raw);
    if (!valid) return res.status(401).json({ error: 'invalid_slack_signature' });
    req.rawBody = raw; next();
  };
}

function createSlackApp({ signingSecret = process.env.SLACK_SIGNING_SECRET, adapter, logger = console } = {}) {
  if (!signingSecret) throw new Error('SLACK_SIGNING_SECRET is required');
  const app = express(); const seenEvents = new Set();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai-documentation-slack' }));

  app.post('/slack/commands', express.raw({ type: 'application/x-www-form-urlencoded', limit: '1mb' }), signatureMiddleware(signingSecret), (req, res) => {
    const body = parseCommandBody(req.rawBody); const command = String(body.command || ''); const text = String(body.text || '');
    if (!['/agent-a', '/agent-b'].includes(command)) return res.status(400).json({ response_type: 'ephemeral', text: `Unsupported command: ${command}` });
    res.json({ response_type: 'ephemeral', text: adapter.acknowledgement ? adapter.acknowledgement(command, text) : `Received ${command} ${text}. Working on it…` });
    setImmediate(async () => {
      try { const result = await adapter.execute(command, text, body); await adapter.deliver(body.response_url, result); }
      catch (error) { logger.error('Slack command failed', error); try { await adapter.deliver(body.response_url, `Command failed: ${error.message}`); } catch (deliveryError) { logger.error('Slack error delivery failed', deliveryError); } }
    });
  });

  app.post('/slack/events', express.raw({ type: 'application/json', limit: '2mb' }), signatureMiddleware(signingSecret), (req, res) => {
    let payload;
    try { payload = JSON.parse(req.rawBody); } catch (_error) { return res.status(400).json({ error: 'invalid_json' }); }
    if (payload.type === 'url_verification') return res.json({ challenge: payload.challenge });
    if (payload.event_id && seenEvents.has(payload.event_id)) return res.json({ ok: true, duplicate: true });
    if (payload.event_id) { seenEvents.add(payload.event_id); if (seenEvents.size > 5000) seenEvents.delete(seenEvents.values().next().value); }
    res.json({ ok: true });
    setImmediate(() => adapter.handleEvent(payload).catch((error) => logger.error('Slack event failed', error)));
  });

  app.use((error, _req, res, _next) => { logger.error('Slack server error', error); res.status(500).json({ error: 'internal_error' }); });
  return app;
}

function startSlackServer() {
  const token = process.env.SLACK_BOT_TOKEN; const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!token) throw new Error('SLACK_BOT_TOKEN is required');
  if (!signingSecret) throw new Error('SLACK_SIGNING_SECRET is required');
  const system = createSystem(); const adapter = new SlackAdapter({ agentA: system.agentA, agentB: system.agentB, defaultPrd: system.slack.defaultPrd, token });
  const app = createSlackApp({ signingSecret, adapter }); const port = Number(process.env.PORT || 3000);
  return app.listen(port, () => console.log(`Slack server listening on http://localhost:${port}`));
}

if (require.main === module) {
  try { startSlackServer(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { createSlackApp, startSlackServer, verifySlackSignature };
