// Configuration. Secrets are read only from environment variables, never from the
// repository (NFR-23). The app refuses to start a request without them.

export const isProduction = () => process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Fixed base URL for every link in an email; never taken from the Host header (NFR-19). */
export function appBaseUrl(): URL {
  const url = new URL(required("APP_BASE_URL"));
  if (isProduction() && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use https in production (NFR-19, NFR-21)");
  }
  return url;
}

export const appOrigin = () => appBaseUrl().origin;

export function link(path: string): string {
  return new URL(path, appBaseUrl()).toString();
}

export function serverSecret(): string {
  const secret = required("SERVER_SECRET");
  if (secret.length < 32) throw new Error("SERVER_SECRET must be at least 32 characters (NFR-23)");
  return secret;
}

export const adminEmail = () => required("ADMIN_EMAIL");
