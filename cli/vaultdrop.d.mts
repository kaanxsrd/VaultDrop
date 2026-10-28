export interface CliKdf {
  alg: "argon2id";
  salt: string;
  t: number;
  m: number;
  p: number;
}
export interface CliEnvelope {
  v: 1;
  iv: string;
  ct: string;
}
export interface CliIO {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}
export declare const DEFAULT_SERVER: string;
export declare const b64u: { encode(bytes: Uint8Array): string; decode(s: string): Uint8Array };
/** Derives the AES-256-GCM key and the redemption proof from a link key (and passphrase). */
export declare function deriveKeys(
  linkKey: string,
  kdf: CliKdf | null,
  passphrase?: string,
): Promise<{ encKey: CryptoKey; authProof: string }>;
/** Encrypts locally. `linkKey` goes in the URL fragment and must never be sent to a server. */
export declare function seal(
  plaintext: string,
  passphrase?: string,
): Promise<{ envelope: CliEnvelope; kdf: CliKdf | null; verifier: string; linkKey: string }>;
export declare function open(envelope: CliEnvelope, encKey: CryptoKey): Promise<string>;
export declare function parseDuration(s: string): number;
export declare function version(): string;
/** Runs the CLI with the given arguments; resolves to the exit code (0 ok, 1 error, 2 usage). */
export declare function run(argv: string[], io?: CliIO): Promise<number>;
