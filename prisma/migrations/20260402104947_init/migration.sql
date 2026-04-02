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

    CONSTRAINT "Subscribe_pkey" PRIMARY KEY ("id")
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
    "desc" TEXT,
    "content" TEXT,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_time" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "comment_num" INTEGER NOT NULL DEFAULT 0,
    "many_covers" BOOLEAN NOT NULL DEFAULT false,
    "covers" TEXT,
    "show_toc" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("cid")
);

-- CreateTable
CREATE TABLE "Comment" (
    "coid" SERIAL NOT NULL,
    "cid" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
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
CREATE TABLE "Category" (
    "mid" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
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
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "mail" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "create" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auth_code" TEXT,
    "role" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PostRelation_cid_mid_key" ON "PostRelation"("cid", "mid");

-- CreateIndex
CREATE UNIQUE INDEX "User_name_key" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_mail_key" ON "User"("mail");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_key_key" ON "Meta"("key");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRelation" ADD CONSTRAINT "PostRelation_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRelation" ADD CONSTRAINT "PostRelation_mid_fkey" FOREIGN KEY ("mid") REFERENCES "Category"("mid") ON DELETE CASCADE ON UPDATE CASCADE;
