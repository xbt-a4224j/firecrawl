/**
 * Playground code generation — render the Firecrawl scrape request (the call we grade) as
 * copy-pasteable Node / Python / cURL snippets that reflect the current config.
 */
import { apiUrlForTarget, type ScrapeTarget } from "../harness/scrape";

export interface ScrapeConfig {
  target?: ScrapeTarget;
  onlyMainContent?: boolean;
  formats?: string[];
}

export interface Snippets {
  node: string;
  python: string;
  curl: string;
}

export function generateScrapeSnippets(url: string, config: ScrapeConfig = {}): Snippets {
  const target = config.target ?? "cloud";
  const apiUrl = apiUrlForTarget(target);
  const onlyMainContent = config.onlyMainContent ?? true;
  const formats = config.formats ?? ["markdown", "html"];

  const formatsJs = JSON.stringify(formats);
  const formatsPy = formats.map((f) => `"${f}"`).join(", ");
  const apiUrlNode = target === "local" ? `, apiUrl: "${apiUrl}"` : "";

  const node = [
    'import Firecrawl from "@mendable/firecrawl-js";',
    "",
    `const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY${apiUrlNode} });`,
    `const doc = await fc.scrape(${JSON.stringify(url)}, {`,
    `  formats: ${formatsJs},`,
    `  onlyMainContent: ${onlyMainContent},`,
    "});",
  ].join("\n");

  const pyApiUrl = target === "local" ? `, api_url="${apiUrl}"` : "";
  const python = [
    "from firecrawl import Firecrawl",
    "",
    `fc = Firecrawl(api_key=os.environ["FIRECRAWL_API_KEY"]${pyApiUrl})`,
    `doc = fc.scrape("${url}", formats=[${formatsPy}], only_main_content=${onlyMainContent ? "True" : "False"})`,
  ].join("\n");

  const body = JSON.stringify({ url, formats, onlyMainContent });
  const curl = [
    `curl -X POST ${apiUrl}/v2/scrape \\`,
    `  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join("\n");

  return { node, python, curl };
}
