/**
 * Checks the e-receipt email settings (SMTP_* in .env) by sending a test email.
 *   npm run mail:test                         (sends to SMTP_USER)
 *   npm run mail:test -- --to you@example.com
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { describeMailError, mailStatus, sendMail } from "@/lib/mail";
import { runCli } from "./lib/cli";

runCli(async () => {
  const { values } = parseArgs({ options: { to: { type: "string" } } });
  const status = mailStatus();
  if (!status.configured) {
    throw new Error("Email is not set up: add SMTP_HOST, SMTP_USER and SMTP_PASSWORD to .env (see .env.example)");
  }
  const to = values.to ?? status.fromAddress ?? "";
  console.log(`Sending a test email via ${status.server}\n  from ${status.fromAddress}\n  to   ${to}`);
  try {
    await sendMail({
      to,
      subject: "POS test email",
      text: "This is a test from your POS. If you can read this, e-receipts will be delivered.",
      html: "<p>This is a test from your POS. If you can read this, e-receipts will be delivered.</p>",
      fromName: process.env.NEXT_PUBLIC_APP_NAME || "Phone POS",
    });
  } catch (error) {
    throw new Error(describeMailError(error));
  }
  console.log("\n✔ Sent. Check the inbox (and the spam folder).");
});
