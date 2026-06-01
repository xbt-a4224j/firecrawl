/**
 * Generates committed demo data for the leaderboard: grades the offline corpus fixtures and writes
 * corpus-results.json. Deterministic — no network. Run: `pnpm build:demo`.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gradeFixtures } from "./fixtures";
import { renderStateOfQuality } from "./stateOfQuality";

const dir = dirname(fileURLToPath(import.meta.url));
const results = gradeFixtures();

const jsonOut = join(dir, "corpus-results.json");
writeFileSync(jsonOut, JSON.stringify(results, null, 2) + "\n");
console.log(`wrote ${results.length} grades -> ${jsonOut}`);

const mdOut = join(dir, "STATE-OF-QUALITY.md");
writeFileSync(mdOut, renderStateOfQuality(results));
console.log(`wrote report -> ${mdOut}`);
