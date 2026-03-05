import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    "Missing required env vars: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY",
  );
  process.exit(1);
}

const content = `window.SIM_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(SUPABASE_PUBLISHABLE_KEY)},
};
`;

const outPath = join(process.cwd(), "config.js");
writeFileSync(outPath, content, { encoding: "utf8" });
console.log(`Generated ${outPath}`);

