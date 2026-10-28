import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVER, deriveKeys, run, seal, version } from "../../cli/vaultdrop.mjs";

function io(stdinText?: string, isTTY = false) {
  const out: string[] = [];
  const err: string[] = [];
  const stdin = Object.assign(Readable.from(stdinText === undefined ? [] : [stdinText]), { isTTY });
  return {
    io: {
      stdin,
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
    },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

describe("vaultdrop CLI", () => {
  it("prints help and version", async () => {
    const h = io();
    expect(await run(["--help"], h.io)).toBe(0);
    expect(h.out()).toContain("Usage");
    expect(h.out()).toContain(DEFAULT_SERVER);
    const v = io();
    expect(await run(["-v"], v.io)).toBe(0);
    expect(v.out().trim()).toBe(version());
    expect(version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("defaults to the production server", () => {
    expect(DEFAULT_SERVER).toBe("https://vaultdrop.vante.app");
  });

  it("rejects unknown options and commands with exit code 2", async () => {
    const a = io("x");
    expect(await run(["--nope"], a.io)).toBe(2);
    expect(a.err()).toContain("--help");
    const b = io("x");
    expect(await run(["publish"], b.io)).toBe(2);
    expect(b.err()).toContain('Unknown command "publish"');
  });

  it("validates --views and --expires before any network call", async () => {
    const a = io("secret");
    expect(await run(["--views", "0", "--server", "http://127.0.0.1:9"], a.io)).toBe(2);
    expect(a.err()).toContain("--views");
    const b = io("secret");
    expect(await run(["--expires", "soon", "--server", "http://127.0.0.1:9"], b.io)).toBe(2);
    expect(b.err()).toContain("Invalid duration");
  });

  it("explains how to pipe input when stdin is a terminal", async () => {
    const t = io(undefined, true);
    expect(await run([], t.io)).toBe(2);
    expect(t.err()).toContain("Pipe the secret on stdin");
  });

  it("rejects incomplete share links for open", async () => {
    const t = io();
    expect(await run(["open", "https://vaultdrop.vante.app/s/abc"], t.io)).toBe(2);
    expect(t.err()).toContain("include the part after #");
  });

  it("refuses abusive Argon2 parameters from a server", async () => {
    const sealed = await seal("x", "pw");
    await expect(
      deriveKeys(sealed.linkKey, { ...sealed.kdf!, m: 4_000_000 }, "pw"),
    ).rejects.toThrow("Unsupported key-derivation parameters");
  });
});
