-- CreateTable
CREATE TABLE "Attachment" (
    "aid" SERIAL NOT NULL,
    "cid" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("aid")
);

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_cid_fkey" FOREIGN KEY ("cid") REFERENCES "Post"("cid") ON DELETE CASCADE ON UPDATE CASCADE;
