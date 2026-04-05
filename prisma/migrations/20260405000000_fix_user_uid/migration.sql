-- Step 1: Add uid column to User table
ALTER TABLE "User" ADD COLUMN "uid" SERIAL NOT NULL;

-- Step 2: Copy id values to uid for existing rows
UPDATE "User" SET "uid" = "id";

-- Step 3: Add uid column to Post table
ALTER TABLE "Post" ADD COLUMN "uid" INTEGER NOT NULL DEFAULT 1;

-- Step 4: Drop old foreign key constraints if they exist
-- (Only if they exist, otherwise ignore errors)
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_uid_fkey";

-- Step 5: Add new foreign key constraint from Post.uid to User.uid
ALTER TABLE "Post" ADD CONSTRAINT "Post_uid_fkey" FOREIGN KEY ("uid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 6: Drop the old id column from User table
-- First need to drop the primary key constraint
ALTER TABLE "User" DROP CONSTRAINT "User_pkey";

-- Set uid as the new primary key
ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("uid");

-- Now drop the old id column
ALTER TABLE "User" DROP COLUMN "id";

-- Step 7: Add nickname column to User table
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;

-- Step 8: Add unique constraint for slug on Post table (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Post_slug_key') THEN
        ALTER TABLE "Post" ADD CONSTRAINT "Post_slug_key" UNIQUE ("slug");
    END IF;
END $$;

-- Step 9: Add unique constraint for slug on Category table (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Category_slug_key') THEN
        ALTER TABLE "Category" ADD CONSTRAINT "Category_slug_key" UNIQUE ("slug");
    END IF;
END $$;

-- Step 10: Update Subscribe table to add lastUpdated column
ALTER TABLE "Subscribe" ADD COLUMN IF NOT EXISTS "lastUpdated" TIMESTAMP(3);
