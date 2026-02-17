/* eslint-disable no-console */

const { Resend } = require("resend");
const readline = require("readline");
const {
  buildFinnyWelcomeEmail,
  DEFAULT_FROM,
  DEFAULT_SUBJECT,
} = require("../lib/emails/finnyWelcomeEmail");
// This welcome email file does not exist, since this file was taken from another project. This is just a reference file to use and how to create a broadcast with resend API.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? next : true;
    args[key] = value;
    if (value !== true) i += 1;
  }
  return args;
}

function printHelp() {
  console.log(
    `\nCreate or update a Resend broadcast using the same content as api/send/route.ts\n\nUsage (Create):\n  RESEND_API_KEY=... node scripts/create-resend-broadcast.js --segmentId <id> [options]\n\nUsage (Update):\n  RESEND_API_KEY=... node scripts/create-resend-broadcast.js --update --broadcastId <id> [options]\n\nCreate Mode - Required:\n  --segmentId <id>\n\nCreate Mode - Optional:\n  --audienceId <id>         (use this instead of segmentId)\n  --from <value>            (default: ${DEFAULT_FROM})\n  --subject <value>         (default: ${DEFAULT_SUBJECT})\n  --name <value>            (default: auto-generated)\n  --previewText <value>\n  --dryRun                  (prints payload, does not call Resend)\n  --send                    (creates AND sends the broadcast)\n\nUpdate Mode - Required:\n  --update                  (enables update mode)\n  --broadcastId <id>        (broadcast ID to update, or will prompt if not provided)\n\nUpdate Mode - Optional:\n  --from <value>            (default: ${DEFAULT_FROM})\n  --subject <value>         (default: ${DEFAULT_SUBJECT})\n  --html <value>            (custom HTML content)\n  --text <value>            (custom text content)\n  --previewText <value>\n  --dryRun                  (prints payload, does not call Resend)\n\nExamples:\n  RESEND_API_KEY=... node scripts/create-resend-broadcast.js --segmentId 7826... --name "Waitlist #1"\n  RESEND_API_KEY=... node scripts/create-resend-broadcast.js --update --broadcastId 559ac32e-9ef5-46fb-82a1-b76b840c0f7b\n  RESEND_API_KEY=... node scripts/create-resend-broadcast.js --update --broadcastId 559ac32e-9ef5-46fb-82a1-b76b840c0f7b --html "Hi {{{FIRST_NAME|there}}}, you can unsubscribe here: {{{RESEND_UNSUBSCRIBE_URL}}}"\n`,
  );
}

function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

async function updateBroadcast(args, apiKey) {
  let broadcastId =
    typeof args.broadcastId === "string" ? args.broadcastId : null;

  // If broadcastId not provided, prompt user
  if (!broadcastId) {
    broadcastId = await question("Enter broadcast ID: ");
    if (!broadcastId || !broadcastId.trim()) {
      console.error("Broadcast ID is required.");
      process.exit(1);
    }
    broadcastId = broadcastId.trim();
  }

  const from = typeof args.from === "string" ? args.from : undefined;
  const subject = typeof args.subject === "string" ? args.subject : undefined;
  const html = typeof args.html === "string" ? args.html : undefined;
  const text = typeof args.text === "string" ? args.text : undefined;
  const previewText =
    typeof args.previewText === "string" ? args.previewText : undefined;

  // If no custom HTML provided, use the default email template
  let content;
  if (!html) {
    content = buildFinnyWelcomeEmail({ from, subject });
  }

  const payload = {
    ...(from || content?.from ? { from: from || content.from } : {}),
    ...(subject || content?.subject
      ? { subject: subject || content.subject }
      : {}),
    ...(html || content?.html ? { html: html || content.html } : {}),
    ...(text || content?.text ? { text: text || content.text } : {}),
    ...(previewText ? { previewText } : {}),
  };

  if (args.dryRun) {
    console.log("Broadcast ID:", broadcastId);
    console.log("Update payload:", JSON.stringify(payload, null, 2));
    return;
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.broadcasts.update(broadcastId, payload);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log("Broadcast updated:", data);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY env var.");
    process.exit(1);
  }

  // Handle update mode
  if (args.update) {
    await updateBroadcast(args, apiKey);
    return;
  }

  const segmentId = typeof args.segmentId === "string" ? args.segmentId : null;
  const audienceId =
    typeof args.audienceId === "string" ? args.audienceId : null;
  if (!segmentId && !audienceId) {
    console.error("Provide either --segmentId or --audienceId.");
    printHelp();
    process.exit(1);
  }

  const from = typeof args.from === "string" ? args.from : undefined;
  const subject = typeof args.subject === "string" ? args.subject : undefined;
  const name =
    typeof args.name === "string"
      ? args.name
      : `Finny Broadcast ${new Date().toISOString().slice(0, 10)}`;
  const previewText =
    typeof args.previewText === "string" ? args.previewText : undefined;

  const content = buildFinnyWelcomeEmail({ from, subject });

  const payload = {
    name,
    segmentId: segmentId || undefined,
    audienceId: audienceId || undefined,
    from: content.from,
    subject: content.subject,
    html: content.html,
    text: content.text,
    replyTo: content.replyTo,
    previewText,
  };

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.broadcasts.create(payload);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log("Broadcast created:", data);

  if (args.send) {
    const broadcastId = data?.id;
    if (!broadcastId) {
      console.error("No broadcast id returned; cannot send.");
      process.exit(1);
    }

    const sent = await resend.broadcasts.send(broadcastId);
    if (sent?.error) {
      console.error(sent.error);
      process.exit(1);
    }
    console.log("Broadcast send triggered:", sent.data);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
