-- CreateTable
CREATE TABLE "Link" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "link" TEXT NOT NULL,
    "avatar" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscribe" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "Subscribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscribePost" (
    "id" SERIAL NOT NULL,
    "subscribeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "author" TEXT,
    "pubDate" TIMESTAMP(3),
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscribePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Changelog" (
    "id" SERIAL NOT NULL,
    "class" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Changelog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "cid" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "desc" TEXT,
    "content" TEXT,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_time" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "comment_num" INTEGER NOT NULL DEFAULT 0,
    "many_covers" BOOLEAN NOT NULL DEFAULT false,
    "covers" TEXT,
    "show_toc" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT,
    "uid" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("cid")
);

-- CreateTable
CREATE TABLE "Comment" (
    "coid" SERIAL NOT NULL,
    "cid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mail" TEXT,
    "link" TEXT,
    "avatar" TEXT,
    "content" TEXT NOT NULL,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 0,
    "parent_id" INTEGER,
    "agent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("coid")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "aid" SERIAL NOT NULL,
    "cid" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'local',
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("aid")
);

-- CreateTable
CREATE TABLE "Category" (
    "mid" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "desc" TEXT,
    "class" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("mid")
);

-- CreateTable
CREATE TABLE "PostRelation" (
    "id" SERIAL NOT NULL,
    "cid" INTEGER NOT NULL,
    "mid" INTEGER NOT NULL,

    CONSTRAINT "PostRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "uid" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "mail" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auth_code" TEXT,
    "role" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscribePost_link_key" ON "SubscribePost"("link");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PostRelation_cid_mid_key" ON "PostRelation"("cid", "mid");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_mail_key" ON "User"("mail");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_key_key" ON "Meta"("key");

-- AddForeignKey
ALTER TABLE "SubscribePost" ADD CONSTRAINT "SubscribePost_subscribeId_fkey" FOREIGN KEY ("subscribeId") REFERENCES "Subscribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_uid_fkey" FOREIGN KEY ("uid") REFERENCES "User"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRelation" ADD CONSTRAINT "PostRelation_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRelation" ADD CONSTRAINT "PostRelation_mid_fkey" FOREIGN KEY ("mid") REFERENCES "Category"("mid") ON DELETE CASCADE ON UPDATE CASCADE;
