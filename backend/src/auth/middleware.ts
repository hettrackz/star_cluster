import type { Request, Response, NextFunction } from "express";
import { verifyUserToken } from "./jwt";
import { getUserById } from "./store";

export type AuthedRequest = Request & {
  user?: {
    id: string;
    email: string;
    name: string;
    emailVerifiedAt?: number | undefined;
  };
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const claims = verifyUserToken(token);
    const user = await getUserById(claims.sub);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = { id: user.id, email: user.email, name: user.name, emailVerifiedAt: user.emailVerifiedAt };
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function requireVerifiedAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  return requireAuth(req, res, () => {
    if (!req.user?.emailVerifiedAt) {
      return res.status(403).json({ error: "Email not verified" });
    }
    return next();
  });
}
