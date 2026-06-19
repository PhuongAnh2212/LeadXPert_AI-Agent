require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const agentA = require('./agents/agentA');
const agentB = require('./agents/agentB');
const figmaMatch = require('./matching/figmaMatch');
const { extractText } = require('./utils/fileParser');
const { configureSlack, postMessage, postReply } = require('./utils/slackHelpers');
const { saveRule } = require('./layers/layer2_feedback');
const { sourceRef } = require('./layers/layer1_generate');

const docsChannel = process.env.DOCS_CHANNEL_ID || 'C_AGENT_A_CHANNEL';
const kbChannel = process.env.KB_CHANNEL_ID || 'C_AGENT_B_CHANNEL';
const figmaMetadataPath = path.join(__dirname, 'samples', 'sample_figma_metadata.json');
const prdPath = path.join(__dirname, 'samples', 'sample_prd.md');
const conversationState = new Map();

function loadFigmaMetadata() {
  return JSON.parse(fs.readFileSync(figmaMetadataPath, 'utf8'));
}

function hasSlackConfig() {
  if (process.env.DOCS_AGENT_MODE === 'demo') return false;
  const hasRequiredValues = Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET && process.env.SLACK_APP_TOKEN);
  const looksLikeRealTokens = String(process.env.SLACK_BOT_TOKEN || '').startsWith('xoxb-') &&
    String(process.env.SLACK_APP_TOKEN || '').startsWith('xapp-') &&
    !String(process.env.SLACK_BOT_TOKEN || '').includes('your-token') &&
    !String(process.env.SLACK_APP_TOKEN || '').includes('your-app-token');
  return hasRequiredValues && looksLikeRealTokens;
}

async function runLocalDemo() {
  const prdText = fs.readFileSync(prdPath, 'utf8');
  const figmaMetadata = loadFigmaMetadata();
  const draft = await agentA.generateDoc(prdText, figmaMetadata);
  const metadata = await agentB.ingestDoc(draft, sourceRef(prdText));
  const answer = await agentB.answerQuestion('How do I set up quiet hours?');

  console.log('🚀 Local demo mode: Slack credentials not found, so npm start ran the full sample pipeline.');
  console.log('\n📄 Agent A Draft\n');
  console.log(draft);
  console.log('\n✅ Agent B Indexed Note\n');
  console.log(metadata);
  console.log('\n💬 Agent B Sample Answer\n');
  console.log(`${answer.answer}\n📚 Source: ${answer.sourceTitle} — ${answer.feature}`);
}

async function startSlackBot() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN
  });

  configureSlack(app.client);

  app.event('file_shared', async ({ event, client, logger }) => {
    try {
      const fileInfo = await client.files.info({ file: event.file_id });
      const file = fileInfo.file;
      const channel = file.channels?.[0] || event.channel_id;
      if (channel !== docsChannel) return;

      const prdText = await extractText(file, client);
      if (!prdText) return;

      const figmaMetadata = loadFigmaMetadata();
      const matches = figmaMatch.matchAll(prdText, figmaMetadata);
      const draft = await agentA.generateDoc(prdText, figmaMetadata);
      const message = await postMessage(channel, '📄 Draft generated. Reply with any corrections or type `approve` to finalise.');
      const threadTs = message.ts;

      conversationState.set(threadTs, { prdText, figmaMetadata, draft, matches, sourceRef: sourceRef(prdText) });
      await postReply(channel, threadTs, draft);

      for (const match of matches.filter((item) => item.pendingConfirmation)) {
        await postReply(channel, threadTs, `⚠️ Inferred match: PRD '${match.prdFeature}' → Figma '${match.artboardName}' (confidence: ${match.confidence.toFixed(2)}). Reply 'confirm ${match.prdFeature}' or 'remap ${match.prdFeature} to [artboard name]' to correct.`);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  app.message(async ({ message, say, client, logger }) => {
    try {
      if (!message.text || message.subtype === 'bot_message') return;

      if (message.channel === docsChannel && message.thread_ts) {
        const state = conversationState.get(message.thread_ts);
        if (!state) return;
        const text = message.text.trim();

        if (/^approve$/i.test(text)) {
          await agentB.ingestDoc(state.draft, state.sourceRef);
          await say({ thread_ts: message.thread_ts, text: '✅ Documentation approved and indexed. Query it in #kb-agent-b.' });
          return;
        }

        if (/^confirm\s+/i.test(text)) {
          const feature = text.replace(/^confirm\s+/i, '').trim();
          saveRule(`Confirm Figma reference for ${feature}.`, feature, 'screens', message.user);
          await say({ thread_ts: message.thread_ts, text: `✅ Confirmed Figma mapping for ${feature} and saved it as a reference rule.` });
          return;
        }

        if (/^remap\s+/i.test(text)) {
          const remap = text.match(/^remap\s+(.+?)\s+to\s+(.+)$/i);
          const feature = remap?.[1]?.trim() || 'General';
          const artboardName = remap?.[2]?.trim() || text;
          saveRule(`Remap ${feature} to Figma artboard ${artboardName}.`, feature, 'screens', message.user);
          await say({ thread_ts: message.thread_ts, text: `✅ Remap saved for ${feature} → ${artboardName}.` });
          return;
        }

        const revised = await agentA.rerunWithCorrection(state.draft, state.prdText, text, state.figmaMetadata);
        state.draft = revised;
        conversationState.set(message.thread_ts, state);
        await say({ thread_ts: message.thread_ts, text: `🔄 Updated based on your feedback. Reply 'approve' to finalise or continue correcting.\n\n${revised}` });
        return;
      }

      if (message.channel === kbChannel) {
        const result = await agentB.answerQuestion(message.text);
        await say({ thread_ts: message.ts, text: `${result.answer}\n\n📚 Source: ${result.sourceTitle} — ${result.feature}` });
        if (result.gapAlert) {
          await client.chat.postMessage({
            channel: docsChannel,
            text: `🔍 Knowledge gap detected: ${result.gapAlert.count} users asked '${result.gapAlert.question}' and Agent B had no answer. Consider adding this to the next doc run.`
          });
        }
      }
    } catch (error) {
      logger.error(error);
    }
  });

  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Documentation agent Slack bot is running.');
}

if (hasSlackConfig()) {
  startSlackBot().catch((error) => {
    console.error('Slack bot failed to start, running local demo pipeline instead.');
    console.error(error.message);
    return runLocalDemo();
  });
} else {
  runLocalDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
