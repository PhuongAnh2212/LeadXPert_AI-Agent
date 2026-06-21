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

function signatureMiddleware(signingSecret, disabled = false) {
  return (req, res, next) => {
    const raw = req.body?.toString('utf8') || '';
    if (disabled) { req.rawBody = raw; return next(); }
    const valid = verifySlackSignature(signingSecret, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'], raw);
    if (!valid) return res.status(401).json({ error: 'invalid_slack_signature' });
    req.rawBody = raw; next();
  };
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return String(message)
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '[redacted authorization]')
    .replace(/xox[a-z]-[A-Za-z0-9-]+/gi, '[redacted Slack token]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}

function createSlackApp({ signingSecret = process.env.SLACK_SIGNING_SECRET, adapter, logger = console, disableSlackSignature = process.env.DEV_DISABLE_SLACK_SIGNATURE === 'true' } = {}) {
  if (!signingSecret && !disableSlackSignature) throw new Error('SLACK_SIGNING_SECRET is required');
  if (disableSlackSignature) logger.warn('DEV MODE: Slack signature verification is disabled. Do not use this setting in production.');
  const app = express(); const seenEvents = new Set();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ai-documentation-slack' }));
  app.post('/mock-response', express.json({ type: '*/*', limit: '1mb' }), (req, res) => {
    logger.info('Mock Slack response received:', req.body);
    res.status(200).send('OK');
  });

  app.post('/slack/commands', express.raw({ type: 'application/x-www-form-urlencoded', limit: '1mb' }), signatureMiddleware(signingSecret, disableSlackSignature), (req, res) => {
    const body = parseCommandBody(req.rawBody); const command = String(body.command || ''); const text = String(body.text || '');
    if (!['/agent-a', '/agent-b'].includes(command)) return res.status(400).json({ response_type: 'ephemeral', text: `Unsupported command: ${command}` });
    const acknowledgement = adapter.acknowledgement ? adapter.acknowledgement(command, text) : 'Agent request received. Processing...';
    res.status(200).json({ response_type: 'ephemeral', text: acknowledgement });
    setImmediate(async () => {
      try { const result = await adapter.execute(command, text, body); await adapter.deliver(body.response_url, result); }
      catch (error) { logger.error('Slack command failed', error); try { await adapter.deliver(body.response_url, `Agent failed: ${safeErrorMessage(error)}`); } catch (deliveryError) { logger.error('Slack error delivery failed', deliveryError); } }
    });
  });

  app.post('/slack/events', express.raw({ type: 'application/json', limit: '2mb' }), signatureMiddleware(signingSecret, disableSlackSignature), (req, res) => {
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
  const disableSlackSignature = process.env.DEV_DISABLE_SLACK_SIGNATURE === 'true';
  if (!token) throw new Error('SLACK_BOT_TOKEN is required');
  if (!signingSecret && !disableSlackSignature) throw new Error('SLACK_SIGNING_SECRET is required');
  const system = createSystem(); const adapter = new SlackAdapter({ agentA: system.agentA, agentB: system.agentB, jira: system.jira, defaultPrd: system.slack.defaultPrd, token });
  const app = createSlackApp({ signingSecret, adapter, disableSlackSignature }); const port = Number(process.env.PORT || 3000);
  return app.listen(port, () => console.log(`Slack server listening on http://localhost:${port}`));
}

if (require.main === module) {
  try { startSlackServer(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { createSlackApp, safeErrorMessage, signatureMiddleware, startSlackServer, verifySlackSignature };
