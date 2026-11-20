/**
 * Outgoing email (SMTP via nodemailer). Server only.
 *
 * Configured with environment variables (see .env.example):
 *   SMTP_HOST, SMTP_PORT (465), SMTP_SECURE (true for 465), SMTP_USER, SMTP_PASSWORD, MAIL_FROM
 * The sender NAME is the shop's business name; the address is MAIL_FROM (default: SMTP_USER).
 * Customers' replies go to the shop's email (Reply-To).
 */
import nodemailer from "nodemailer";
import { AppError } from "@/lib/errors";

export type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
};

/** SMTP settings from the environment, or null when email is not set up. */
export function mailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD ?? "";
  if (!host || !user || !password) return null;
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureSetting ? secureSetting === "true" : port === 465;
  return { host, port, secure, user, password, fromAddress: process.env.MAIL_FROM?.trim() || user };
}

export function isMailConfigured(): boolean {
  return mailConfig() !== null;
}

/** Non-secret summary for the settings page. */
export function mailStatus(): { configured: boolean; server: string | null; fromAddress: string | null } {
  const config = mailConfig();
  return config
    ? { configured: true, server: `${config.host}:${config.port}${config.secure ? " (SSL)" : ""}`, fromAddress: config.fromAddress }
    : { configured: false, server: null, fromAddress: null };
}

function createSmtpTransport(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

/** (typed from the SMTP overload of createTransport, so sendMail() returns SMTP message info) */
type SmtpTransport = ReturnType<typeof createSmtpTransport>;
let cached: { key: string; transporter: SmtpTransport } | null = null;

function getTransporter(config: MailConfig): SmtpTransport {
  const key = [config.host, config.port, config.secure, config.user, config.password].join("|");
  if (!cached || cached.key !== key) cached = { key, transporter: createSmtpTransport(config) };
  return cached.transporter;
}

export type OutgoingMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Display name, e.g. the shop's business name */
  fromName?: string | null;
  replyTo?: string | null;
};

export async function sendMail(message: OutgoingMail): Promise<{ messageId: string }> {
  const config = mailConfig();
  if (!config) {
    throw new AppError(503, "MAIL_NOT_CONFIGURED", "Email is not set up yet. Add the SMTP settings to the .env file.");
  }
  const info = await getTransporter(config).sendMail({
    from: { name: message.fromName?.trim() || config.fromAddress, address: config.fromAddress },
    to: message.to,
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { messageId: info.messageId };
}

/** Readable reason for an SMTP failure, shown to staff (never contains the password). */
export function describeMailError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const e = (error ?? {}) as { code?: string; responseCode?: number; response?: string; message?: string };
  const config = mailConfig();
  const server = config ? `${config.host}:${config.port}` : "the mail server";
  switch (e.code) {
    case "EAUTH":
      return "The mail server rejected the login. Check SMTP_USER (usually the full email address) and SMTP_PASSWORD.";
    case "ENOTFOUND":
    case "EDNS":
      return `Mail server ${config?.host ?? ""} not found. Check SMTP_HOST.`;
    case "ECONNREFUSED":
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
      return `Cannot connect to ${server}. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE (465 = SSL true, 587 = false).`;
    case "EENVELOPE":
      return `The mail server refused the address: ${e.response ?? e.message ?? ""}`.trim();
  }
  if (e.responseCode) return `Mail server answered ${e.responseCode}: ${e.response ?? e.message ?? ""}`.trim();
  return e.message ?? "Unknown error";
}
