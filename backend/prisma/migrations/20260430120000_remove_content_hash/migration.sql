-- Drop title-hash column and index (cross-source similarity is out of scope).
DROP INDEX IF EXISTS "articles_content_hash_idx";
ALTER TABLE "articles" DROP COLUMN IF EXISTS "content_hash";
