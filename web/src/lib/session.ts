import crypto from "node:crypto";
import { get, now, run } from "./db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "pp_session";
export const SESSION_DAYS = 7;

export interface SessionUser { id: string; email: string; name: string; mustChangePassword: boolean }

interface UserRow { id: string; email: string; name: string; password_hash: string; must_change_password: number }

// Only a hash of the token is stored, so a database leak does not expose live sessions
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const toUser = (u: UserRow): SessionUser => ({ id: u.id, email: u.email, name: u.name, mustChangePassword: !!u.must_change_password });

export async function checkCredentials(email: string, password: string): Promise<SessionUser | null> {
  const u = await get<UserRow>("SELECT * FROM users WHERE email = ?", email.trim().toLowerCase());
  // Hash anyway when the user is unknown, so response time does not reveal which emails exist
  if (!u) {
    await verifyPassword(password, "scrypt$00$00");
    return null;
  }
  return (await verifyPassword(password, u.password_hash)) ? toUser(u) : null;
}

export async function createSession(userId: string, userAgent: string | null): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await run("INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    hashToken(token), userId, expires.toISOString(), now(), userAgent?.slice(0, 200) ?? null);
  await run("UPDATE users SET last_login_at = ? WHERE id = ?", now(), userId);
  // Housekeeping: drop expired sessions
  await run("DELETE FROM sessions WHERE expires_at < ?", now());
  return { token, expires };
}

export async function getSessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const u = await get<UserRow>(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?",
    hashToken(token), now(),
  );
  return u ? toUser(u) : null;
}

export async function deleteSession(token: string | undefined | null) {
  if (token) await run("DELETE FROM sessions WHERE id = ?", hashToken(token));
}

// Changing the password signs out every other session of that user
export async function changePassword(userId: string, current: string, next: string, keepToken: string): Promise<string | null> {
  const u = await get<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  if (!u || !(await verifyPassword(current, u.password_hash))) return "The current password is wrong";
  if (next.length < 10) return "The new password needs at least 10 characters";
  if (next === current) return "Choose a password different from the current one";
  await run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", await hashPassword(next), userId);
  await run("DELETE FROM sessions WHERE user_id = ? AND id != ?", userId, hashToken(keepToken));
  return null;
}

// Simple in-memory brute-force protection: 5 failed logins per email+IP in 10 minutes
const failures = new Map<string, number[]>();
const WINDOW = 10 * 60 * 1000;

export function loginBlocked(key: string): boolean {
  const recent = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  failures.set(key, recent);
  return recent.length >= 5;
}

export function recordFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}

export function clearFailures(key: string) {
  failures.delete(key);
}

