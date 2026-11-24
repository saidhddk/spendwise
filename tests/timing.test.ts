import { describe, expect, it } from "vitest";
import * as loginRoute from "@/app/api/auth/login/route";
import * as registerRoute from "@/app/api/auth/register/route";
import * as resetRoute from "@/app/api/auth/reset/route";
import { Browser, createUser, uniqueEmail } from "./helpers";

// NFR-18: over 50 requests, the median response time differs by at most 100 ms between
// registered and unregistered addresses (login, registration and password-reset pages).

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return (s[24] + s[25]) / 2;
};

async function time(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

async function compare(name: string, registered: (i: number) => Promise<unknown>, unregistered: (i: number) => Promise<unknown>) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 50; i++) {
    a.push(await time(() => registered(i)));
    b.push(await time(() => unregistered(i)));
  }
  const diff = Math.abs(median(a) - median(b));
  console.log(`NFR-18 ${name}: median registered ${median(a).toFixed(1)} ms, unregistered ${median(b).toFixed(1)} ms, difference ${diff.toFixed(1)} ms`);
  return diff;
}

describe("NFR-18 no timing difference between registered and unregistered addresses", () => {
  it("login, registration and reset", async () => {
    const users: { email: string }[] = [];
    for (let i = 0; i < 10; i++) users.push(await createUser());
    const post = (route: typeof loginRoute, path: string, body: unknown) => new Browser().call(route.POST, "POST", path, body);

    const login = await compare(
      "login",
      (i) => post(loginRoute, "/api/auth/login", { email: users[i % 10].email, password: `Wrong-pass-${i}` }),
      (i) => post(loginRoute, "/api/auth/login", { email: uniqueEmail(`nobody${i}`), password: `Wrong-pass-${i}` }),
    );
    const register = await compare(
      "registration",
      (i) => post(registerRoute as typeof loginRoute, "/api/auth/register", { email: users[i % 10].email, password: `New-pass-${i}-x` }),
      (i) => post(registerRoute as typeof loginRoute, "/api/auth/register", { email: uniqueEmail(`new${i}`), password: `New-pass-${i}-x` }),
    );
    const reset = await compare(
      "password reset",
      (i) => post(resetRoute as typeof loginRoute, "/api/auth/reset", { email: users[i % 10].email }),
      (i) => post(resetRoute as typeof loginRoute, "/api/auth/reset", { email: uniqueEmail(`ghost${i}`) }),
    );
    expect(login).toBeLessThan(100);
    expect(register).toBeLessThan(100);
    expect(reset).toBeLessThan(100);
  }, 240_000);
});
