import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { proxy } from "@/proxy";
import { getSessionUser, changePassword, createSession, SESSION_COOKIE } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { get, ready } from "@/lib/db";

const ADMIN = { email: "admin@test.local", password: "Initial-Pass-123" };

const loginReq = (email: string, password: string, ip = "10.0.0.1") =>
  new Request("http://app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });

const tokenFrom = (res: Response) => /pp_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];

const proxyReq = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://app.test${path}`, { headers });

describe("passwords", () => {
  it("hash and verify with scrypt", async () => {
    const h = await hashPassword("s3cret-value");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("s3cret-value", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("default login", () => {
  it("is created from ADMIN_EMAIL / ADMIN_PASSWORD on start and must be changed", async () => {
    await ready();
    const u = await get<{ email: string; must_change_password: number; password_hash: string }>("SELECT * FROM users");
    expect(u).toMatchObject({ email: ADMIN.email, must_change_password: 1 });
    expect(u!.password_hash).not.toContain(ADMIN.password);
  });
});

describe("login", () => {
  it("refuses a wrong password", async () => {
    const res = await login(loginReq(ADMIN.email, "nope"));
    expect(res.status).toBe(401);
    expect(tokenFrom(res)).toBeUndefined();
  });

  it("sets an httpOnly session cookie that identifies the user", async () => {
    const res = await login(loginReq(ADMIN.email.toUpperCase(), ADMIN.password));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    const user = await getSessionUser(tokenFrom(res));
    expect(user).toMatchObject({ email: ADMIN.email, mustChangePassword: true });
  });

  it("blocks after 5 failed attempts from the same address", async () => {
    for (let i = 0; i < 5; i++) await login(loginReq(ADMIN.email, "bad", "10.9.9.9"));
    const res = await login(loginReq(ADMIN.email, ADMIN.password, "10.9.9.9"));
    expect(res.status).toBe(429);
  });
});

describe("proxy", () => {
  it("sends visitors without a session to the login page", async () => {
    const res = await proxy(proxyReq("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://app.test/login?next=%2Fdashboard");
  });

  it("answers 401 to API calls without a session", async () => {
    const res = await proxy(proxyReq("/api/settings"));
    expect(res.status).toBe(401);
  });

  it("lets signed-in users through", async () => {
    const token = tokenFrom(await login(loginReq(ADMIN.email, ADMIN.password, "10.0.0.2")))!;
    const res = await proxy(proxyReq("/api/settings", { cookie: `${SESSION_COOKIE}=${token}` }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the login page, health check and n8n callbacks open", async () => {
    for (const path of ["/login", "/api/health", "/api/internal/prompts"]) {
      expect((await proxy(proxyReq(path))).headers.get("x-middleware-next")).toBe("1");
    }
    const img = await proxy(proxyReq("/api/images/a.png", { "x-postpilot-secret": "test-secret" }));
    expect(img.headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(proxyReq("/api/images/a.png"))).status).toBe(401);
  });
});

describe("change password", () => {
  it("checks the current password, clears the default flag and signs out other sessions", async () => {
    const user = (await getSessionUser(tokenFrom(await login(loginReq(ADMIN.email, ADMIN.password, "10.0.0.3")))))!;
    const keep = await createSession(user.id, "this device");
    const other = await createSession(user.id, "other device");
    expect(await changePassword(user.id, "wrong", "Another-Pass-456", keep.token)).toMatch(/wrong/);
    expect(await changePassword(user.id, ADMIN.password, "short", keep.token)).toMatch(/10 characters/);
    expect(await changePassword(user.id, ADMIN.password, "Another-Pass-456", keep.token)).toBeNull();
    expect(await getSessionUser(other.token)).toBeNull();
    expect(await getSessionUser(keep.token)).toMatchObject({ mustChangePassword: false });
    expect((await login(loginReq(ADMIN.email, "Another-Pass-456", "10.0.0.4"))).status).toBe(200);
  });
});
