# Publishing the `vaultdrop` CLI to npm

This guide takes the CLI in `cli/` from this repository to the npm registry, so anyone can run:

```bash
npm install -g vaultdrop      # or: bun add -g vaultdrop
echo "$TOKEN" | vaultdrop --expires 1h
```

|                |                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package name   | `vaultdrop` (unscoped; it was free when checked on 2026-10-28)                                                                                           |
| Command        | `vaultdrop`                                                                                                                                              |
| License        | MIT (`cli/LICENSE`)                                                                                                                                      |
| Default server | `https://vaultdrop.vante.app` (override with `--server` or `VAULTDROP_SERVER`)                                                                           |
| What ships     | `bin.mjs`, `vaultdrop.mjs`, `vaultdrop.d.mts`, `README.md`, `LICENSE`, `package.json` and `assets/banner.webp` (the README banner), about 92 kB unpacked |
| Release tags   | `cli-vX.Y.Z` (e.g. `cli-v0.1.0`)                                                                                                                         |

There are two ways to publish. Do the **first release by hand** (part 2), because npm only lets you set up automated publishing for a package that already exists. Then use the **GitHub Actions workflow** for every later release (part 4).

---

## Part 0: One-time setup

### 0.1 Create and secure an npm account

1. Sign up at <https://www.npmjs.com/signup> and verify your email address.
2. Enable two-factor authentication: Account → **Two-Factor Authentication** → _Authorization and publishing_. Publishing requires it.

### 0.2 Log in from your terminal

Publishing uses the `npm` command, which comes with Node.js. Bun can publish too (`bun publish`), but npm's provenance and trusted publishing features need the npm CLI.

```bash
npm login        # opens the browser to authenticate
npm whoami       # should print your npm username
```

### 0.3 Point the package at your GitHub repository

Add a `repository` field to `cli/package.json`. It links the npm page to your code, and **provenance requires it**. The URL must exactly match the repository that runs the publish workflow:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/<your-github-user-or-org>/VaultDrop.git",
  "directory": "cli"
}
```

---

## Part 1: Pre-flight checks (every release)

Run these from the repository root.

```bash
# 1. Tests: includes the CLI's own tests and the CLI <-> web-app encryption interop tests.
bun run test

# 2. See exactly what will be published.
cd cli
npm pack --dry-run
```

`npm pack --dry-run` should list only the seven files above. If you see test files, `.env` files or anything else, stop: the `files` list in `cli/package.json` controls this.

**3. Install the real tarball and try it**, exactly as a user would:

```bash
npm pack                                   # creates vaultdrop-<version>.tgz
npm install -g ./vaultdrop-*.tgz
vaultdrop --version
echo "smoke test" | vaultdrop --expires 5m # prints a link
vaultdrop open "<that link>"               # prints "smoke test"
npm uninstall -g vaultdrop
rm vaultdrop-*.tgz
```

> To test against a local server instead of production, add `--server http://localhost:3000`.

---

## Part 2: First publish (manual)

```bash
cd cli
npm whoami                       # confirm you're logged in as the right account
npm publish --access public      # asks for your 2FA code
```

Check that it worked:

```bash
npm view vaultdrop                # shows version, license and dist-tags
npx vaultdrop@latest --version    # runs the published package
```

Open <https://www.npmjs.com/package/vaultdrop>: the README from `cli/README.md` is the package page.

---

## Part 3: Releasing a new version

Choose the version bump with [semantic versioning](https://semver.org):

| Change                                         | Bump  | Example       |
| ---------------------------------------------- | ----- | ------------- |
| Bug fix, no behaviour change                   | patch | 0.1.0 → 0.1.1 |
| New flag or command, backwards compatible      | minor | 0.1.1 → 0.2.0 |
| Removed or renamed flag, changed output format | major | 0.2.0 → 1.0.0 |

> **Never change the envelope format, HKDF labels or padding** in a CLI release without the same change in `src/lib/crypto/envelope.ts`. The interop tests in `tests/unit/` exist to catch exactly that.

```bash
cd cli
npm version minor --no-git-tag-version   # updates cli/package.json only
cd ..
git add cli/package.json
git commit -m "cli: release v0.2.0"
git tag cli-v0.2.0
git push && git push origin cli-v0.2.0   # the tag push triggers the publish workflow (part 4)
```

Without automation, run part 1, then `cd cli && npm publish` instead of pushing the tag.

---

## Part 4: Automated publishing with GitHub Actions (recommended)

`.github/workflows/publish-cli.yml` runs on every `cli-v*` tag. It:

1. Runs the full test suite.
2. Checks that the tag matches `cli/package.json` and that the `repository` field exists.
3. Packs the tarball, installs it in a clean directory and runs `vaultdrop --version` and `--help`.
4. Publishes with **provenance**, so the npm page shows a verified link to the exact commit and workflow that built it.

It uses **npm Trusted Publishing** (OpenID Connect), so **no npm token is stored in GitHub**.

### 4.1 Connect npm to the workflow (once, after the first publish)

On npmjs.com: **your package → Settings → Trusted publishing → GitHub Actions**, then enter:

| Field                | Value                   |
| -------------------- | ----------------------- |
| Organization or user | your GitHub user or org |
| Repository           | `VaultDrop`             |
| Workflow filename    | `publish-cli.yml`       |
| Environment          | `npm`                   |

### 4.2 Protect the release environment (optional, recommended)

In GitHub: **Settings → Environments → New environment → `npm`**. Add yourself as a _required reviewer_; each publish then waits for your approval.

### 4.3 Lock down token publishing

Once a CI release has succeeded, go to the package's **Settings → Publishing access** and choose _Require two-factor authentication and disallow tokens_. Only the trusted workflow, or you with 2FA, can then publish.

### 4.4 Release

```bash
git tag cli-v0.2.0 && git push origin cli-v0.2.0
```

Watch it under **Actions → Publish CLI**.

---

## Part 5: Using the published CLI (share this with your team)

```bash
npm install -g vaultdrop                  # or run without installing: npx vaultdrop
export VAULTDROP_API_KEY=vd_live_…        # optional: VaultDrop → Dashboard → API keys (Pro plan)

echo "$DB_PASSWORD" | vaultdrop --expires 1h
vaultdrop --passphrase --views 3 < recovery-codes.txt
vaultdrop open "https://vaultdrop.vante.app/s/…#…"
vaultdrop --help
```

In CI:

```yaml
- run: |
    LINK=$(printf '%s' "$GENERATED_PASSWORD" | npx -y vaultdrop --expires 2h)
    echo "::add-mask::$LINK"
  env:
    VAULTDROP_API_KEY: ${{ secrets.VAULTDROP_API_KEY }}
```

---

## Part 6: Fixing mistakes

| Situation                                   | What to do                                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A release has a bug                         | Publish a fixed patch version. Optionally warn users of the broken one: `npm deprecate vaultdrop@0.2.0 "Broken --views handling, upgrade to 0.2.1"`                                                                       |
| Want to test before everyone gets it        | `npm publish --tag next`, then testers install `vaultdrop@next`. `latest` is untouched.                                                                                                                                   |
| Published something that must not be public | `npm unpublish vaultdrop@<version>` works within 72 hours if nothing depends on it. **The version number can never be reused.** If it contained a secret, rotate that secret anyway: the tarball may already be mirrored. |

---

## Troubleshooting

| Error                                                      | Cause and fix                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `E403 … You do not have permission to publish "vaultdrop"` | Someone published the name first, or it's too similar to an existing package. Check `npm view vaultdrop`; use another name (e.g. `@<your-org>/vaultdrop`) in `cli/package.json` if needed. |
| `EOTP` / one-time password required                        | Run `npm publish` again and enter your 2FA code, or use `--otp=123456`.                                                                                                                    |
| `ENEEDAUTH`                                                | Not logged in: `npm login`.                                                                                                                                                                |
| `E402 Payment Required`                                    | A scoped package (`@org/name`) is private by default; publish with `--access public` (already set in `publishConfig`).                                                                     |
| `E422 … provenance … repository`                           | `repository.url` in `cli/package.json` doesn't match the GitHub repository running the workflow (part 0.3).                                                                                |
| Workflow fails with `Tag … does not match`                 | You tagged `cli-v0.2.0` but `cli/package.json` says another version. Bump with `npm version`, commit, then re-tag.                                                                         |
| `vaultdrop: command not found` after a global install      | npm's global bin folder isn't on your PATH: run `npm prefix -g` and add its `bin` (macOS/Linux) or the folder itself (Windows) to PATH.                                                    |
