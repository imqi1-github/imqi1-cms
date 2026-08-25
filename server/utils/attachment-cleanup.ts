import prisma from "#server/utils/prisma";
import { deleteAttachmentFile } from "#server/utils/attachment-file";

export async function deleteOrphanAttachments(aids: number[]) {
  const uniqueAids = Array.from(new Set(aids.filter(Number.isInteger)));
  if (uniqueAids.length === 0) return 0;

  // 先快照出孤儿（含 url/storage，供删文件用），再用同一孤儿条件删行：
  // 反序曾导致「先删文件 → 并发把附件重新关联 → deleteMany 因已非孤儿跳过 → 留下活引用到已删文件」。
  const orphans = await prisma.attachments.findMany({
    where: {
      aid: { in: uniqueAids },
      contentattachments: { none: {} },
    },
    select: {
      aid: true,
      storage: true,
      url: true,
    },
  });

  if (orphans.length === 0) return 0;
  const orphanAids = orphans.map(attachment => attachment.aid);

  // 事务内删行（仍带孤儿条件，避免并发重新关联的附件被误删）
  await prisma.attachments.deleteMany({
    where: {
      aid: { in: orphanAids },
      contentattachments: { none: {} },
    },
  });

  // 找出真正被删的行：仍存活的 = 并发被重新关联而受保护，其文件不能删。
  const stillThere = await prisma.attachments.findMany({
    where: { aid: { in: orphanAids } },
    select: { aid: true },
  });
  const stillSet = new Set(stillThere.map(a => a.aid));
  const deleted = orphans.filter(attachment => !stillSet.has(attachment.aid));

  // 只对真正被删的行删文件：先删行后删文件，若文件删除失败只留下孤儿文件（下次清理可重试），
  // 不会造成「数据库还引用着、文件却已删」的死引用。
  for (const attachment of deleted) {
    await deleteAttachmentFile(attachment);
  }

  return deleted.length;
}
