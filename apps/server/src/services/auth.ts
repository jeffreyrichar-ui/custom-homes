import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { Dbi } from "../db/dbi.js";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

const COOKIE_NAME = "ch_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifySessionToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

export async function loadUser(dbi: Dbi, userId: string): Promise<SessionUser | null> {
  const rows = await dbi.query<SessionUser>(
    `SELECT id, email, name, role FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function findUserByEmail(dbi: Dbi, email: string): Promise<
  { id: string; email: string; password_hash: string; name: string | null; role: string } | null
> {
  const rows = await dbi.query<{
    id: string;
    email: string;
    password_hash: string;
    name: string | null;
    role: string;
  }>(
    `SELECT id, email, password_hash, name, role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  maxAge: TOKEN_TTL_SECONDS * 1000,
  path: "/",
};
