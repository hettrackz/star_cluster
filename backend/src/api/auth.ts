import { Router } from "express";
import bcrypt from "bcryptjs";
import { verifyTurnstile } from "../auth/captcha";
import {
  createEmailVerificationToken,
  createPasswordResetToken,
  createUser,
  clearAuthData,
  deleteUserById,
  generateResetTokenValue,
  getUserByEmail,
  setUserEmailVerifiedAt,
  updateUserPassword,
  updateUserProfile,
  consumePasswordResetToken,
  consumeEmailVerificationToken,
  updateUserPasswordByEmail,
} from "../auth/store";
import { signUserToken } from "../auth/jwt";
import { requireAuth, type AuthedRequest } from "../auth/middleware";
import { readFile } from "fs/promises";
import path from "path";
import { sendEmailVerificationEmail, sendPasswordResetEmail, verifySmtpConnection } from "../auth/email";

function sanitizeConfiguredBaseUrl(value: string) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^['"`]+/, "").replace(/['"`]+$/, "");
  return unquoted.replace(/\/+$/, "");
}

function getAppBaseUrl(req: { protocol?: string; get: (name: string) => string | undefined }) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return sanitizeConfiguredBaseUrl(configured);
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost ?? req.get("host") ?? "";
  const proto = forwardedProto ?? req.protocol ?? "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function getClientIp(req: { header: (name: string) => string | undefined; ip?: string | undefined }) {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.ip;
}

export function registerAuthRoutes(router: Router) {
  router.post("/auth/register", async (req, res) => {
    const { email, password, name, avatarUrl, captchaToken } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      avatarUrl?: string;
      captchaToken?: string;
    };

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password too short" });
    }

    const captcha = await verifyTurnstile({ token: captchaToken ?? "", ip: getClientIp(req) });
    if (!captcha.success) {
      return res.status(400).json({
        error: captcha.errorCodes.length ? `Captcha failed (${captcha.errorCodes.join(",")})` : "Captcha failed",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await createUser({ email, passwordHash, name: name.trim(), avatarUrl });
      const rawToken = generateResetTokenValue();
      await createEmailVerificationToken({ userId: user.id, rawToken, ttlMs: 24 * 60 * 60 * 1000 });
      const verifyUrl = `${getAppBaseUrl(req)}/verify-email?token=${encodeURIComponent(rawToken)}`;
      try {
        const sent = await sendEmailVerificationEmail({ to: user.email, verifyUrl });
        const devLink = process.env.NODE_ENV === "production" ? null : verifyUrl;
        return res.json({ ok: true, verifyUrl: sent ? null : devLink });
      } catch (e) {
        console.error("sendEmailVerificationEmail failed", e);
        if (process.env.NODE_ENV === "production") {
          await deleteUserById(user.id);
          return res.status(503).json({ error: "Email service unavailable" });
        }
        return res.json({ ok: true, verifyUrl: verifyUrl });
      }
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_TAKEN") {
        return res.status(409).json({ error: "Email already registered" });
      }
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/auth/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const allowUnverified =
      process.env.NODE_ENV !== "production" || process.env.ALLOW_UNVERIFIED_LOGIN === "true";
    if (!allowUnverified && !user.emailVerifiedAt) {
      return res.status(403).json({ error: "Email not verified" });
    }

    const token = signUserToken(user);
    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl ?? null },
    });
  });

  router.get("/auth/me", requireAuth, async (req: AuthedRequest, res) => {
    return res.json({ user: req.user });
  });

  router.post("/auth/profile", requireAuth, async (req: AuthedRequest, res) => {
    const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string };
    try {
      const updated = await updateUserProfile({
        userId: req.user!.id,
        name: typeof name === "string" ? name : undefined,
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : undefined,
      });
      return res.json({ user: { id: updated.id, email: updated.email, name: updated.name, avatarUrl: updated.avatarUrl ?? null } });
    } catch {
      return res.status(500).json({ error: "Update failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    router.get("/auth/dev-users", async (_req, res) => {
      try {
        const dbPath =
          process.env.AUTH_DB_PATH ??
          path.resolve(process.cwd(), path.join("backend", "data", "auth.json"));
        const raw = await readFile(dbPath, "utf8");
        const data = JSON.parse(raw) as { users?: Array<{ id: string; email: string; name: string; emailVerifiedAt?: number }> };
        const users = (data.users ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          verified: Boolean(u.emailVerifiedAt),
        }));
        return res.json({ users });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ error: msg });
      }
    });

    router.post("/auth/dev-reset-password", async (req, res) => {
      const { email, newPassword } = req.body as { email?: string; newPassword?: string };
      if (!email || !newPassword) return res.status(400).json({ error: "Missing fields" });
      if (newPassword.length < 8) return res.status(400).json({ error: "Password too short" });
      const hash = await bcrypt.hash(newPassword, 12);
      try {
        await updateUserPasswordByEmail({ email, passwordHash: hash });
        return res.json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(404).json({ error: msg });
      }
    });

    router.post("/auth/dev-seed-users", async (req, res) => {
      const requested = (req.body as { count?: number } | undefined)?.count;
      const count = Math.max(1, Math.min(4, typeof requested === "number" ? Math.floor(requested) : 4));

      await clearAuthData();
      const created: Array<{ email: string; password: string; name: string }> = [];

      for (let i = 1; i <= count; i++) {
        const email = `test${i}@star.local`;
        const name = `Tester ${i}`;
        const password = `SCX-${generateResetTokenValue().slice(0, 10)}`;
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await createUser({ email, passwordHash, name });
        await setUserEmailVerifiedAt({ userId: user.id, at: Date.now() });
        created.push({ email, password, name });
      }

      return res.json({ ok: true, users: created });
    });
  }

  router.post("/auth/forgot-password", async (req, res) => {
    const { email, captchaToken } = req.body as { email?: string; captchaToken?: string };
    if (!email) return res.json({ ok: true });

    const captcha = await verifyTurnstile({ token: captchaToken ?? "", ip: getClientIp(req) });
    if (!captcha.success) {
      return res.status(400).json({
        error: captcha.errorCodes.length ? `Captcha failed (${captcha.errorCodes.join(",")})` : "Captcha failed",
      });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.json({ ok: true });

    const rawToken = generateResetTokenValue();
    await createPasswordResetToken({ userId: user.id, rawToken, ttlMs: 15 * 60 * 1000 });
    const resetUrl = `${getAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
    let sent = false;
    try {
      sent = await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (e) {
      console.error("sendPasswordResetEmail failed", e);
      sent = false;
    }
    const devLink = process.env.NODE_ENV === "production" ? null : resetUrl;
    return res.json({ ok: true, resetUrl: sent ? null : devLink });
  });

  router.post("/auth/reset-password", async (req, res) => {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password too short" });
    }

    const consumed = await consumePasswordResetToken({ rawToken: token });
    if (!consumed) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await updateUserPassword({ userId: consumed.userId, passwordHash });
    return res.json({ ok: true });
  });

  router.post("/auth/resend-verification", async (req, res) => {
    const { email, captchaToken } = req.body as { email?: string; captchaToken?: string };
    if (!email) return res.json({ ok: true });

    const captcha = await verifyTurnstile({ token: captchaToken ?? "", ip: getClientIp(req) });
    if (!captcha.success) {
      return res.status(400).json({
        error: captcha.errorCodes.length ? `Captcha failed (${captcha.errorCodes.join(",")})` : "Captcha failed",
      });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.json({ ok: true });
    if (user.emailVerifiedAt) return res.json({ ok: true });

    const rawToken = generateResetTokenValue();
    await createEmailVerificationToken({ userId: user.id, rawToken, ttlMs: 24 * 60 * 60 * 1000 });
    const verifyUrl = `${getAppBaseUrl(req)}/verify-email?token=${encodeURIComponent(rawToken)}`;
    let sent = false;
    try {
      sent = await sendEmailVerificationEmail({ to: user.email, verifyUrl });
    } catch (e) {
      console.error("sendEmailVerificationEmail failed", e);
      sent = false;
    }
    const devLink = process.env.NODE_ENV === "production" ? null : verifyUrl;
    return res.json({ ok: true, verifyUrl: sent ? null : devLink });
  });

  if (process.env.NODE_ENV !== "production") {
    router.get("/debug/smtp", async (_req, res) => {
      try {
        await verifySmtpConnection();
        return res.json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
      }
    });

    router.post("/debug/email/test", async (req, res) => {
      const to = (req.body as { to?: string } | undefined)?.to;
      if (!to) return res.status(400).json({ ok: false, error: "Missing 'to'" });
      const verifyUrl = `${getAppBaseUrl(req)}/verify-email?token=dev-test`;
      try {
        await sendEmailVerificationEmail({ to, verifyUrl });
        return res.json({ ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
      }
    });
  }

  router.post("/auth/verify-email", async (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) return res.status(400).json({ error: "Missing fields" });
    const consumed = await consumeEmailVerificationToken({ rawToken: token });
    if (!consumed) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }
    return res.json({ ok: true });
  });
}
