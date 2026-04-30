-- CreateEnum
CREATE TYPE "FakeStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rss_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fake_articles" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "fakeTitle" TEXT,
    "fakeDescription" TEXT,
    "model_used" TEXT,
    "status" "FakeStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fake_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "query_kind" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");
CREATE UNIQUE INDEX "sources_rss_url_key" ON "sources"("rss_url");

-- CreateIndex
CREATE UNIQUE INDEX "articles_url_key" ON "articles"("url");
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at" DESC);
CREATE INDEX "articles_source_id_published_at_idx" ON "articles"("source_id", "published_at" DESC);
CREATE INDEX "articles_content_hash_idx" ON "articles"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "fake_articles_article_id_key" ON "fake_articles"("article_id");
CREATE INDEX "fake_articles_status_idx" ON "fake_articles"("status");

-- CreateIndex
CREATE INDEX "chat_messages_article_id_created_at_idx" ON "chat_messages"("article_id", "created_at");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fake_articles" ADD CONSTRAINT "fake_articles_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
