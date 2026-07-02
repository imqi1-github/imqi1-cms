import prisma from "#server/utils/prisma";
import { deleteAttachmentFile } from "#server/utils/attachment-file";

export async function deleteOrphanAttachments(aids: number[]) {
  const uniqueAids = Array.from(new Set(aids.filter(Number.isInteger)));
  if (uniqueAids.length === 0) return 0;

  const orphans = await prisma.attachments.findMany({
    where: {
      aid: { in: uniqueAids },
      posts: { none: {} },
    },
    select: {
      aid: true,
      storage: true,
      url: true,
    },
  });

  for (const attachment of orphans) {
    await deleteAttachmentFile(attachment);
  }

  if (orphans.length === 0) return 0;

  const result = await prisma.attachments.deleteMany({
    where: {
      aid: { in: orphans.map(attachment => attachment.aid) },
      posts: { none: {} },
    },
  });

  return result.count;
}
