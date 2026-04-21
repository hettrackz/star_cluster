import nodemailer from "nodemailer";

type EmailTransport = "smtp" | "resend";

type MailerConfig = {
  host: string;
  port: number;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
};

function getFromAddress() {
  return process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? null;
}

function getEmailTransport(): EmailTransport | null {
  const forced = (process.env.EMAIL_TRANSPORT ?? "").trim().toLowerCase();
  if (forced === "smtp") return "smtp";
  if (forced === "resend") return "resend";
  if (forced === "disabled" || forced === "none" || forced === "off") return null;

  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

function getMailerConfig(): MailerConfig | null {
  const from = getFromAddress();
  if (!from) return null;
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  if (!host || !portRaw) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port)) return null;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return {
    host,
    port,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from,
  };
}

function requireMailerConfig(): MailerConfig {
  const cfg = getMailerConfig();
  if (cfg) return cfg;
  throw new Error("SMTP_NOT_CONFIGURED");
}

function createTransporter(cfg: MailerConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user!, pass: cfg.pass! },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function sendViaResend(params: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getFromAddress();
  if (!apiKey || !from) {
    throw new Error("RESEND_NOT_CONFIGURED");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RESEND_ERROR_${res.status}${body ? `:${body}` : ""}`);
  }
}

export async function verifySmtpConnection(): Promise<void> {
  const cfg = requireMailerConfig();
  const transporter = createTransporter(cfg);
  await transporter.verify();
}

export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}): Promise<boolean> {
  const transport = getEmailTransport();
  if (process.env.NODE_ENV !== "production") {
    if (!transport) {
      console.log(`[DEV MODE] Password Reset Link for ${params.to}: ${params.resetUrl}`);
      return false;
    }
    if (transport === "smtp") {
      const cfg = requireMailerConfig();
      const transporter = createTransporter(cfg);
      await transporter.sendMail({
        from: cfg.from,
        to: params.to,
        subject: "Passwort zurücksetzen",
        text: `Öffne diesen Link, um dein Passwort zurückzusetzen:\n\n${params.resetUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
      });
    } else {
      await sendViaResend({
        to: params.to,
        subject: "Passwort zurücksetzen",
        text: `Öffne diesen Link, um dein Passwort zurückzusetzen:\n\n${params.resetUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
      });
    }
    return true;
  }

  if (!transport) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }
  if (transport === "smtp") {
    const cfg = requireMailerConfig();
    const transporter = createTransporter(cfg);
    await transporter.sendMail({
      from: cfg.from,
      to: params.to,
      subject: "Passwort zurücksetzen",
      text: `Öffne diesen Link, um dein Passwort zurückzusetzen:\n\n${params.resetUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
    });
  } else {
    await sendViaResend({
      to: params.to,
      subject: "Passwort zurücksetzen",
      text: `Öffne diesen Link, um dein Passwort zurückzusetzen:\n\n${params.resetUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
    });
  }
  return true;
}

export async function sendEmailVerificationEmail(params: {
  to: string;
  verifyUrl: string;
}): Promise<boolean> {
  const transport = getEmailTransport();
  if (process.env.NODE_ENV !== "production") {
    if (!transport) {
      console.log(`[DEV MODE] Email Verification Link for ${params.to}: ${params.verifyUrl}`);
      return false;
    }
    if (transport === "smtp") {
      const cfg = requireMailerConfig();
      const transporter = createTransporter(cfg);
      await transporter.sendMail({
        from: cfg.from,
        to: params.to,
        subject: "Email bestätigen",
        text: `Öffne diesen Link, um deine Email-Adresse zu bestätigen:\n\n${params.verifyUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
      });
    } else {
      await sendViaResend({
        to: params.to,
        subject: "Email bestätigen",
        text: `Öffne diesen Link, um deine Email-Adresse zu bestätigen:\n\n${params.verifyUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
      });
    }
    return true;
  }

  if (!transport) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }
  if (transport === "smtp") {
    const cfg = requireMailerConfig();
    const transporter = createTransporter(cfg);
    await transporter.sendMail({
      from: cfg.from,
      to: params.to,
      subject: "Email bestätigen",
      text: `Öffne diesen Link, um deine Email-Adresse zu bestätigen:\n\n${params.verifyUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
    });
  } else {
    await sendViaResend({
      to: params.to,
      subject: "Email bestätigen",
      text: `Öffne diesen Link, um deine Email-Adresse zu bestätigen:\n\n${params.verifyUrl}\n\nWenn du das nicht warst, ignoriere diese Email.`,
    });
  }
  return true;
}
