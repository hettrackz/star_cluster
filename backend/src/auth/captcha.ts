export async function verifyTurnstile(params: {
  token: string;
  ip?: string | undefined;
}): Promise<{ success: boolean; errorCodes: string[] }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: true, errorCodes: [] };
  if (!params.token) return { success: false, errorCodes: ["missing-input-response"] };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", params.token);
  if (params.ip) body.set("remoteip", params.ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      return { success: false, errorCodes: ["turnstile-http-error"] };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    const errorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
    return { success: Boolean(data.success), errorCodes };
  } catch {
    return { success: false, errorCodes: ["turnstile-unreachable"] };
  }
}
