/**
 * OpenAPI 3.1 description of VaultDrop's public REST API (v1). Served at /api/v1/openapi.json and
 * rendered by /docs/api. Keep in sync with src/app/api/v1/** (tests assert the paths exist).
 */

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const secretId = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[A-Za-z0-9_-]{22}$" },
  description: "Secret identifier (128-bit, base64url).",
};

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "VaultDrop API",
      version: "1.0.0",
      description:
        "Create and manage end-to-end encrypted, one-time secrets. **Encryption happens on the client**: you send ciphertext and a verifier, never plaintext or keys. See /docs for the envelope format and SDK examples.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Secrets", description: "Create, inspect, redeem and destroy secrets." },
      { name: "Account", description: "Usage and API keys (session auth)." },
      { name: "Webhooks", description: "Signed event notifications." },
    ],
    paths: {
      "/secrets": {
        post: {
          tags: ["Secrets"],
          operationId: "createSecret",
          summary: "Create a secret",
          description:
            "Stores a client-side encrypted envelope. Anonymous calls (no Authorization) are allowed with anonymous limits. Supply `Idempotency-Key` to make retries safe (authenticated only).",
          security: [{ bearerAuth: [] }, {}],
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: false,
              schema: { type: "string", minLength: 8, maxLength: 128 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateSecretRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CreateSecretResponse" },
                },
              },
            },
            "403": errorResponse("Plan restriction or missing scope"),
            "413": errorResponse("Ciphertext larger than plan allows"),
            "422": errorResponse(
              "Validation failed or idempotency key reused with a different body",
            ),
            "429": errorResponse("Rate limited or monthly quota exceeded"),
          },
        },
        get: {
          tags: ["Secrets"],
          operationId: "listSecrets",
          summary: "List your secrets (metadata only)",
          parameters: [
            {
              name: "state",
              in: "query",
              schema: {
                type: "string",
                enum: ["all", "active", "consumed", "expired", "revoked"],
                default: "all",
              },
            },
            {
              name: "q",
              in: "query",
              schema: { type: "string", maxLength: 80 },
              description: "Search your private labels.",
            },
            {
              name: "sort",
              in: "query",
              schema: {
                type: "string",
                enum: ["created_desc", "created_asc", "expires_asc", "expires_desc"],
              },
            },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "environment",
              in: "query",
              schema: { type: "string", enum: ["live", "test"] },
            },
          ],
          responses: {
            "200": {
              description: "A page of secrets",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array", items: { $ref: "#/components/schemas/Receipt" } },
                      total: { type: "integer" },
                      page: { type: "integer" },
                      pageSize: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": errorResponse("Authentication required"),
          },
        },
      },
      "/secrets/{id}": {
        get: {
          tags: ["Secrets"],
          operationId: "getReceipt",
          summary: "Get secret metadata (receipt)",
          description:
            "Authorized by the receipt token (`X-Receipt-Token`), the owner's API key with `secrets:read`, or the owner's session.",
          security: [{ bearerAuth: [] }, { receiptToken: [] }],
          parameters: [secretId],
          responses: {
            "200": {
              description: "Receipt",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Receipt" } } },
            },
            "404": errorResponse("Not found or not yours"),
          },
        },
      },
      "/secrets/{id}/status": {
        get: {
          tags: ["Secrets"],
          operationId: "getSecretStatus",
          summary: "Pre-redemption status (public)",
          description:
            "Does not consume the secret. Returns KDF parameters the recipient needs to derive the proof.",
          security: [{}],
          parameters: [secretId],
          responses: {
            "200": {
              description: "Status",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecretStatus" } },
              },
            },
            "404": errorResponse("Unknown secret"),
          },
        },
      },
      "/secrets/{id}/redeem": {
        post: {
          tags: ["Secrets"],
          operationId: "redeemSecret",
          summary: "Redeem (open) a secret",
          description:
            "Verifies `proof` (HKDF-derived from the link key and passphrase) and, if valid, consumes one view atomically and returns the envelope. A wrong proof never consumes; after `maxFailedAttempts` the secret is destroyed.",
          security: [{}],
          parameters: [secretId],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["proof"],
                  properties: { proof: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" } },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Envelope released; the view has been consumed.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      envelope: { $ref: "#/components/schemas/Envelope" },
                      viewsRemaining: { type: "integer" },
                    },
                  },
                },
              },
            },
            "403": errorResponse("Invalid proof (details.attemptsRemaining)"),
            "404": errorResponse("Unknown secret"),
            "410": errorResponse("Consumed, expired or revoked (details.state)"),
            "429": errorResponse("Rate limited"),
          },
        },
      },
      "/secrets/{id}/burn": {
        post: {
          tags: ["Secrets"],
          operationId: "burnSecret",
          summary: "Destroy a secret before it is read",
          security: [{ bearerAuth: [] }, { receiptToken: [] }],
          parameters: [secretId],
          responses: {
            "200": {
              description: "Resulting state",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { state: { $ref: "#/components/schemas/SecretState" } },
                  },
                },
              },
            },
            "404": errorResponse("Not found or not yours"),
          },
        },
      },
      "/account/usage": {
        get: {
          tags: ["Account"],
          operationId: "getUsage",
          summary: "Plan, limits and usage for the current period",
          responses: {
            "200": { description: "Usage" },
            "401": errorResponse("Authentication required"),
          },
        },
      },
      "/account/api-keys": {
        get: {
          tags: ["Account"],
          operationId: "listApiKeys",
          summary: "List API keys (session only)",
          security: [{ session: [] }],
          responses: { "200": { description: "Keys (prefix only)" } },
        },
        post: {
          tags: ["Account"],
          operationId: "createApiKey",
          summary: "Create an API key (session only). The token is returned once.",
          security: [{ session: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string", maxLength: 60 },
                    environment: { type: "string", enum: ["live", "test"] },
                    scopes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["secrets:create", "secrets:read", "secrets:burn", "webhooks:manage"],
                      },
                    },
                    expiresInDays: { type: "integer", minimum: 1, maximum: 365 },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/account/api-keys/{keyId}": {
        delete: {
          tags: ["Account"],
          operationId: "revokeApiKey",
          summary: "Revoke an API key",
          security: [{ session: [] }],
          parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Revoked" }, "404": errorResponse("Not found") },
        },
      },
      "/webhooks": {
        get: {
          tags: ["Webhooks"],
          operationId: "listWebhooks",
          summary: "List endpoints and recent deliveries",
          responses: { "200": { description: "Endpoints" } },
        },
        post: {
          tags: ["Webhooks"],
          operationId: "createWebhook",
          summary: "Create an endpoint. The signing secret is returned once.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: { type: "array", items: { $ref: "#/components/schemas/WebhookEvent" } },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Created" } },
        },
      },
      "/webhooks/{id}": {
        delete: {
          tags: ["Webhooks"],
          operationId: "deleteWebhook",
          summary: "Delete an endpoint",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Deleted" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key: `vd_live_…` or `vd_test_…`.",
        },
        receiptToken: { type: "apiKey", in: "header", name: "X-Receipt-Token" },
        session: { type: "apiKey", in: "cookie", name: "vaultdrop.session_token" },
      },
      schemas: {
        SecretState: { type: "string", enum: ["active", "consumed", "expired", "revoked"] },
        WebhookEvent: {
          type: "string",
          enum: [
            "secret.created",
            "secret.viewed",
            "secret.consumed",
            "secret.revoked",
            "secret.expired",
          ],
        },
        Envelope: {
          type: "object",
          required: ["v", "iv", "ct"],
          properties: {
            v: { const: 1 },
            iv: { type: "string", description: "base64url, 12 bytes" },
            ct: { type: "string", description: "base64url AES-256-GCM ciphertext + 16-byte tag" },
          },
        },
        Kdf: {
          type: ["object", "null"],
          required: ["alg", "salt", "t", "m", "p"],
          properties: {
            alg: { const: "argon2id" },
            salt: { type: "string", description: "base64url, 16 bytes" },
            t: { type: "integer", minimum: 2, maximum: 8 },
            m: { type: "integer", minimum: 19456, maximum: 131072, description: "KiB" },
            p: { type: "integer", minimum: 1, maximum: 4 },
          },
        },
        CreateSecretRequest: {
          type: "object",
          required: ["envelope", "verifier", "expiresIn"],
          properties: {
            envelope: { $ref: "#/components/schemas/Envelope" },
            kdf: { $ref: "#/components/schemas/Kdf" },
            verifier: {
              type: "string",
              description: "base64url SHA-256 of the auth proof (43 chars)",
            },
            expiresIn: {
              type: "integer",
              minimum: 60,
              description: "Seconds; maximum depends on plan",
            },
            maxViews: { type: "integer", minimum: 1, maximum: 100, default: 1 },
            maxFailedAttempts: { type: "integer", minimum: 3, maximum: 20, default: 10 },
            label: {
              type: "string",
              maxLength: 80,
              description: "Private, unencrypted. Never put secrets here.",
            },
          },
        },
        CreateSecretResponse: {
          type: "object",
          properties: {
            id: { type: "string" },
            expiresAt: { type: "string", format: "date-time" },
            maxViews: { type: "integer" },
            receiptToken: { type: "string", description: "Authorizes receipt/burn. Keep private." },
            shareUrlBase: { type: "string", description: "Append `#<linkKey>` client-side." },
            receiptUrlBase: { type: "string", description: "Append `#<receiptToken>`." },
          },
        },
        SecretStatus: {
          type: "object",
          properties: {
            state: { $ref: "#/components/schemas/SecretState" },
            requiresPassphrase: { type: "boolean" },
            kdf: { $ref: "#/components/schemas/Kdf" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            viewsRemaining: { type: "integer" },
          },
        },
        Receipt: {
          type: "object",
          properties: {
            id: { type: "string" },
            state: { $ref: "#/components/schemas/SecretState" },
            createdAt: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time" },
            maxViews: { type: "integer" },
            viewCount: { type: "integer" },
            hasPassphrase: { type: "boolean" },
            label: { type: ["string", "null"] },
            consumedAt: { type: ["string", "null"], format: "date-time" },
            revokedAt: { type: ["string", "null"], format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object" },
              },
            },
            requestId: { type: "string", format: "uuid" },
          },
        },
      },
    },
  } as const;
}

export type OpenApiDoc = ReturnType<typeof buildOpenApi>;
