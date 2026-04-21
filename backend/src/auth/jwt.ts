import jwt from "jsonwebtoken";
import type { User } from "./store";

export type AuthClaims = {
  sub: string;
  email: string;
  name: string;
};

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is not set");
  }
  return "dev-secret-change-me";
}

export function signUserToken(user: User) {
  const claims: AuthClaims = {
    sub: user.id,
    email: user.email,
    name: user.name,
  };
  return jwt.sign(claims, getJwtSecret(), { expiresIn: "30d" });
}

export function verifyUserToken(token: string): AuthClaims {
  return jwt.verify(token, getJwtSecret()) as AuthClaims;
}
