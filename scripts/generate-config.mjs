import { writeFileSync } from "node:fs";
import { join } from "node:path";

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return { name, value: value.trim() };
    }
  }
  return { name: null, value: "" };
}

const urlEnv = firstEnv([
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

const keyEnv = firstEnv([
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

const SUPABASE_URL = urlEnv.value;
const SUPABASE_PUBLISHABLE_KEY = keyEnv.value;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  const envNames = Object.keys(process.env)
    .filter((k) => /SUPABASE|NEXT_PUBLIC|CF_PAGES/i.test(k))
    .sort();

  console.error(
    "Missing required env vars. Expected one of:\n" +
      "- URL: SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL\n" +
      "- KEY: SUPABASE_PUBLISHABLE_KEY | SUPABASE_ANON_KEY | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  console.error(`Visible related env names: ${envNames.length ? envNames.join(", ") : "(none)"}`);
  process.exit(1);
}

const content = `window.SIM_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(SUPABASE_PUBLISHABLE_KEY)},
};
`;

const outPath = join(process.cwd(), "config.js");
writeFileSync(outPath, content, { encoding: "utf8" });
console.log(`Generated ${outPath} using ${urlEnv.name} and ${keyEnv.name}`);
