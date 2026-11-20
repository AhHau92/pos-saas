import { z } from "zod";
import { isValidEmail, normalizeEmail } from "@/lib/contact";
import { AppError } from "@/lib/errors";
import { describeMailError, mailStatus, sendMail } from "@/lib/mail";
import { assertCan, type ServiceContext } from "@/lib/service-context";
import { parseInput } from "@/lib/validation";
import { getBusinessProfile } from "./business-profile.service";

export { mailStatus };

const testSchema = z.object({
  to: z.string().trim().max(254).refine(isValidEmail, "Enter a valid email address"),
});

/** Owner: checks the SMTP settings by sending a short test email. */
export async function sendTestEmail(ctx: ServiceContext, input: unknown): Promise<{ sentTo: string; from: string | null }> {
  assertCan(ctx, "settings.manage");
  const { to } = parseInput(testSchema, input);
  const profile = await getBusinessProfile(ctx.db);
  const address = normalizeEmail(to);
  try {
    await sendMail({
      to: address,
      subject: `Test email from ${profile.name}`,
      text: `This is a test from your POS. If you can read this, e-receipts will be delivered.\n\n${profile.name}`,
      html: `<p>This is a test from your POS. If you can read this, e-receipts will be delivered.</p><p>${profile.name
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</p>`,
      fromName: profile.name,
      replyTo: profile.email,
    });
  } catch (error) {
    throw new AppError(502, "MAIL_FAILED", describeMailError(error));
  }
  return { sentTo: address, from: mailStatus().fromAddress };
}
