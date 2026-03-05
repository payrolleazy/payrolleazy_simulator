import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const envNames = Object.keys(process.env)
    .filter((k) => /SUPABASE|NEXT_PUBLIC|CF_PAGES/i.test(k))
    .sort();

  console.error(
    "Missing required env vars. Expected:\n" +
      "- NEXT_PUBLIC_SUPABASE_URL\n" +
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  console.error(`Visible related env names: ${envNames.length ? envNames.join(", ") : "(none)"}`);
  process.exit(1);
}

const content = `window.SIM_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)},
};
`;

const outPath = join(process.cwd(), "config.js");
writeFileSync(outPath, content, { encoding: "utf8" });
console.log(`Generated ${outPath} using NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY`);
