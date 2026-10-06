const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = !!(url && key);
let clientPromise;

export async function getCloudClient() {
  if (!cloudConfigured) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      if (key.startsWith("sb_secret_")) throw new Error("Use a public publishable key.");
      if (key.includes(".")) {
        const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (payload.role === "service_role") throw new Error("Use a public anon key.");
      }
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(url, key, {
        auth: { storageKey: "flashcards-cloud-auth", persistSession: true, autoRefreshToken: true },
      });
    })();
  }
  return clientPromise;
}
