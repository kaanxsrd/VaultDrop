/** Structure-only starting points. They never contain real values and are applied client-side. */
export const SECRET_TEMPLATES = [
  { id: "login", label: "Login", body: "Service: \nUsername: \nPassword: \nNotes: " },
  {
    id: "api-key",
    label: "API key",
    body: "Provider: \nKey ID: \nSecret: \nScopes: \nRotate by: ",
  },
  { id: "database", label: "Database", body: "Host: \nPort: \nDatabase: \nUser: \nPassword: " },
  { id: "wifi", label: "Wi‑Fi", body: "Network (SSID): \nPassword: \nSecurity: WPA2/WPA3" },
  { id: "recovery", label: "Recovery codes", body: "Account: \nCodes:\n1. \n2. \n3. \n4. \n5. " },
] as const;
