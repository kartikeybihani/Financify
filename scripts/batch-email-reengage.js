#!/usr/bin/env node
/**
 * Batch Email: Re-engage users who stopped at bank connection
 *
 * Usage:
 *   # Send to all users who stopped at bank connection (accounts_connected = false):
 *   node scripts/batch-email-reengage.js
 *
 *   # Send to a specific user by ID:
 *   node scripts/batch-email-reengage.js --user-id 695a670d-b927-48f6-80d1-e8b908d5cb08
 *
 *   # Dry run (fetch and preview only, no send):
 *   node scripts/batch-email-reengage.js --dry-run
 *   node scripts/batch-email-reengage.js --user-id <uuid> --dry-run
 */

import "dotenv/config";
import { Resend } from "resend";
import { supabase } from "../lib/api/supabase.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL =
  process.env.BATCH_EMAIL_FROM || "Kartik <kartik@usefinny.com>";
const REPLY_TO = "finnyadvisor@gmail.com";
const TESTFLIGHT_LINK = "https://testflight.apple.com/join/up8XVCpC";

function buildEmailText(firstName) {
  const name = firstName?.trim() || "there";
  return `Hi ${name},

You tried Finny earlier and stopped at the bank connection step.

Since then, we've improved the onboarding and added a demo mode so you can look around without connecting anything first.

If you do connect, Finny builds your budget automatically from your spending history and you can build a plan for your financial goals.

That's where you'll see your safe-to-spend number and how your current spending affects your goals.

If it still doesn't feel worth it, that's fine — but I'd really value knowing why.

Here's the link: ${TESTFLIGHT_LINK}

Finny
Kartik`;
}

async function getEmailsForUserIds(userIds) {
  const emailById = new Map();
  for (const id of userIds) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (!error && data?.user?.email) {
      emailById.set(id, data.user.email);
    }
  }
  return emailById;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const userIndex = args.indexOf("--user-id");
  const singleUserId = userIndex >= 0 ? args[userIndex + 1] : null;

  if (!RESEND_API_KEY && !dryRun) {
    console.error("❌ RESEND_API_KEY is required (set in .env)");
    process.exit(1);
  }

  let targetUserIds = new Set();

  if (singleUserId) {
    const { data: user, error } =
      await supabase.auth.admin.getUserById(singleUserId);
    if (error || !user?.user) {
      console.error(`❌ User not found: ${singleUserId}`);
      process.exit(1);
    }
    targetUserIds.add(singleUserId);
    console.log(`📧 Single-user mode: ${singleUserId}`);
  } else {
    const { data: profilesData, error: profError } = await supabase
      .from("profiles")
      .select("id")
      .eq("onboarding_step", 3)
      .eq("onboarding_completed", false);

    if (profError) {
      console.error("❌ Error fetching profiles:", profError.message);
      process.exit(1);
    }
    targetUserIds = new Set((profilesData || []).map((p) => p.id));
    console.log(
      `📧 Batch mode: ${targetUserIds.size} users (onboarding_step=3, onboarding_completed=false)`,
    );
  }

  if (targetUserIds.size === 0) {
    console.log("No users to email.");
    process.exit(0);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name")
    .in("id", [...targetUserIds]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  const emailById = await getEmailsForUserIds([...targetUserIds]);

  const recipients = [];
  for (const userId of targetUserIds) {
    const email = emailById.get(userId);
    if (!email) {
      console.warn(`⚠️ No email for user ${userId}`);
      continue;
    }
    const profile = profileMap.get(userId);
    recipients.push({ userId, email, firstName: profile?.first_name ?? null });
  }

  const emails = recipients.map(({ email, firstName }) => ({
    from: FROM_EMAIL,
    to: [email],
    reply_to: REPLY_TO,
    subject: "Hey! It's Finny!",
    text: buildEmailText(firstName),
  }));

  if (dryRun) {
    console.log("\n--- DRY RUN (no emails sent) ---\n");
    recipients.forEach((r, i) => {
      console.log(`${i + 1}. ${r.email} (${r.firstName || "no first_name"})`);
      console.log(buildEmailText(r.firstName).split("\n")[0] + "\n");
    });
    console.log(`\nWould send ${emails.length} emails.`);
    return;
  }

  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.batch.send(emails);

  if (error) {
    console.error("❌ Resend batch error:", error);
    process.exit(1);
  }

  console.log(`✅ Sent ${data?.data?.length ?? emails.length} emails.`);
  if (data?.data) {
    data.data.forEach((r, i) =>
      console.log(`   ${i + 1}. ${recipients[i]?.email} → id: ${r.id}`),
    );
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
