// Idempotent seed of the three required RSS sources. Runs at container start
// so a fresh deploy has sources available immediately. Re-running is safe —
// upsert by `name`.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCES = [
  {
    name: "New York Times",
    rssUrl: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  },
  {
    name: "NPR News",
    rssUrl: "https://feeds.npr.org/1001/rss.xml",
  },
  {
    name: "The Guardian",
    rssUrl: "https://www.theguardian.com/world/rss",
  },
];

async function main() {
  for (const s of SOURCES) {
    await prisma.source.upsert({
      where: { name: s.name },
      update: { rssUrl: s.rssUrl },
      create: s,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${SOURCES.length} sources`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
