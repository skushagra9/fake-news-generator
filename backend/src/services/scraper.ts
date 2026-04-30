import { XMLParser } from "fast-xml-parser";
import { prisma } from "../db";
import { logger } from "../logger";
import { transformQueue } from "../queue";

// Shape of an item we care about, after parsing. Different feeds put fields
// in different places, so the parsing layer is responsible for mapping into
// this shape.
export type ParsedItem = {
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  cdataPropName: false,
  // The Guardian feed packs enough &amp;/&lt; entities into a single CDATA
  // description that fast-xml-parser's built-in XXE-protection limit (1000
  // expansions) trips and the parse aborts. We disable entity expansion at
  // the parser level and decode them ourselves below — safe because we
  // immediately strip HTML anyway.
  processEntities: false,
});

// Strip HTML and decode the common XML/HTML entities so feed descriptions
// render as clean text. Order matters: decode &lt;/&gt; FIRST (so we can
// then strip the resulting tags), and decode &amp; LAST (so we don't
// double-decode something like "&amp;lt;").
function clean(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(input: unknown): Date {
  if (typeof input !== "string") return new Date();
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Feed elements have a few shapes depending on parser/feed:
//   "https://..."                            (plain text node)
//   { "#text": "https://..." }                (text node + siblings)
//   { "@_href": "https://..." }               (Atom <link href="..."/>)
//   [ {...}, {...} ]                          (multiple values)
// Walk all of them and return the first non-empty string we find.
function extractText(field: unknown): string | null {
  if (field == null) return null;
  if (typeof field === "string") return field.trim() || null;
  if (typeof field === "number") return String(field);
  if (Array.isArray(field)) {
    for (const f of field) {
      const r = extractText(f);
      if (r) return r;
    }
    return null;
  }
  if (typeof field === "object") {
    const o = field as Record<string, unknown>;
    return (
      extractText(o["@_href"]) ??
      extractText(o["#text"]) ??
      extractText(o["@_url"]) ??
      null
    );
  }
  return null;
}

function parseFeed(rawXml: string): ParsedItem[] {
  const doc = xml.parse(rawXml);
  // RSS 2.0 vs Atom — handle both shapes; the three required feeds are RSS
  // but a small bit of robustness here is cheap insurance.
  const rssItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const items: unknown[] = Array.isArray(rssItems)
    ? rssItems
    : rssItems
      ? [rssItems]
      : Array.isArray(atomEntries)
        ? atomEntries
        : atomEntries
          ? [atomEntries]
          : [];

  return items
    .map((rawItem): ParsedItem | null => {
      const item = rawItem as Record<string, unknown>;
      const title = clean(extractText(item.title) ?? "");
      const description = clean(
        extractText(item.description) ?? extractText(item.summary) ?? ""
      );
      // For URL prefer <link>, fall back to <guid> (common in RSS) and <id>
      // (common in Atom). Some Atom feeds put multiple <link rel="..."/>
      // entries; extractText walks the array and returns the first href.
      const url =
        extractText(item.link) ??
        extractText(item.guid) ??
        extractText(item.id) ??
        "";
      const publishedAt = parseDate(
        (item.pubDate as string) ?? (item.published as string) ?? (item.updated as string)
      );

      if (!title || !url) return null;
      return { title, description, url, publishedAt };
    })
    .filter((x): x is ParsedItem => x !== null);
}

export type ScrapeResult = {
  sourceName: string;
  fetched: number;
  inserted: number;
  duplicates: number;
};

const MAX_ITEMS_PER_SOURCE = 10;

// Scrape a single source. We:
//   1. fetch the RSS,
//   2. upsert each item (url is the unique key, so re-runs are idempotent),
//   3. for newly-inserted articles, create a PENDING FakeArticle and enqueue
//      a transform job. Existing articles are skipped — we don't re-transform.
async function scrapeSource(source: {
  id: string;
  name: string;
  rssUrl: string;
}): Promise<ScrapeResult> {
  const res = await fetch(source.rssUrl, {
    headers: {
      "User-Agent": "fake-news-generator/1.0 (+https://example.local)",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed for ${source.name}: ${res.status}`);
  }
  const text = await res.text();
  const items = parseFeed(text)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, MAX_ITEMS_PER_SOURCE);

  let inserted = 0;
  let duplicates = 0;

  for (const item of items) {
    // Step 1: try the DB insert. On unique-violation of `url` we skip — we
    // DON'T want to clobber the already-generated fake version of an
    // article we've seen before.
    let article;
    try {
      article = await prisma.article.create({
        data: {
          sourceId: source.id,
          title: item.title,
          description: item.description,
          url: item.url,
          publishedAt: item.publishedAt,
          fake: { create: {} }, // 1:1 PENDING fake row
        },
      });
      inserted++;
    } catch (err: any) {
      if (err?.code === "P2002") {
        duplicates++;
      } else {
        logger.error({ err, item }, "failed to insert article");
      }
      continue;
    }

    // Step 2: enqueue the transform job. We do this AFTER the insert
    // succeeded, in its own try/catch, so a transient queue failure
    // doesn't void the insert count. The job is idempotent (transformer
    // checks status === COMPLETED before doing work), so it's safe to use
    // a deterministic jobId for dedupe — note the `_` separator: BullMQ
    // rejects `:` in custom IDs.
    try {
      await transformQueue.add(
        "transform",
        { articleId: article.id },
        { jobId: `transform_${article.id}` }
      );
    } catch (err) {
      // Article exists with PENDING fake — a future scrape won't re-enqueue
      // (URL is already in DB). For now we log; the followup is a
      // reconciliation worker that re-enqueues stale PENDING fakes.
      logger.error({ err, articleId: article.id }, "failed to enqueue transform");
    }
  }

  return {
    sourceName: source.name,
    fetched: items.length,
    inserted,
    duplicates,
  };
}

export async function scrapeAllSources(): Promise<ScrapeResult[]> {
  const sources = await prisma.source.findMany();
  // Run sources in parallel — they're independent and bound by network I/O.
  // Use Promise.allSettled so one bad feed doesn't kill the whole run.
  const settled = await Promise.allSettled(sources.map(scrapeSource));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          sourceName: sources[i].name,
          fetched: 0,
          inserted: 0,
          duplicates: 0,
        }
  );
}
