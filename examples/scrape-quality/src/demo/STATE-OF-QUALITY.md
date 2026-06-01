# State of Scrape Quality

_Graded 7 pages · average 80/100._

Firecrawl's success gate is a liveness check — `isLongEnough` just means the markdown is non-empty —
so every degradation below ships as a `200 success`. This makes that quality measurable.

## Worst pages

| score | rating | category | url | top finding |
|---|---|---|---|---|
| 61 | C | tables | https://example.com/pricing | TABLE_FLATTENED |
| 61 | C | code-docs | https://docs.example.com/install | CODE_UNFENCED |
| 74 | C | cmp-cookie | https://shop.de/ | INLINE_GLUE |
| 80 | B | spa | https://app.example.com/ | HIGH_BOILERPLATE |
| 81 | B | nav-heavy | https://news.example.com/article | HIGH_BOILERPLATE |
| 100 | A | clean-control | https://docs.example.com/about | — |
| 100 | A | i18n-charset | https://jp.example.com/tokyo | — |

## Failure modes

- HIGH_BOILERPLATE ×3
- CODE_LANG_LOST ×1
- CODE_UNFENCED ×1
- INLINE_GLUE ×1
- TABLE_FLATTENED ×1

## By category

- **code-docs** — avg 61, worst 61 (1 pages)
- **tables** — avg 61, worst 61 (1 pages)
- **cmp-cookie** — avg 74, worst 74 (1 pages)
- **spa** — avg 80, worst 80 (1 pages)
- **nav-heavy** — avg 81, worst 81 (1 pages)
- **clean-control** — avg 100, worst 100 (1 pages)
- **i18n-charset** — avg 100, worst 100 (1 pages)
