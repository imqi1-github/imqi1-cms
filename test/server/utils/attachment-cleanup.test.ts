import "#test/helpers/nitro-globals";

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { mockSharedPrisma, sharedFake } from "#test/helpers/fake-prisma";

mockSharedPrisma();

// deleteAttachmentFile 走真实现(不 mock attachment-file,mock.module 进程级会污染其它文件):
// 用 UPLOADS_DIR 指向临时目录,孤儿文件的删除是真实的
const cleanupDir = mkdtempSync(join(tmpdir(), "cleanup-"));
const ORIGINAL_UPLOADS = process.env.UPLOADS_DIR;
process.env.UPLOADS_DIR = cleanupDir;
beforeEach(() => {
  rmSync(cleanupDir, { recursive: true, force: true });
  mkdirSync(cleanupDir, { recursive: true });
});
afterAll(() => {
  process.env.UPLOADS_DIR = ORIGINAL_UPLOADS;
  rmSync(cleanupDir, { recursive: true, force: true });
});

// attachments 内存表(孤儿判定:无 contentattachments 关联即孤儿)
interface Row { aid: number; storage: string; url: string; linked: boolean }
let rows: Row[] = [];

sharedFake.on("attachments", "findMany", async ({ where }: { where: { aid: { in: number[] }; contentattachments: { none: object } } }) =>
  rows.filter(r => where.aid.in.includes(r.aid) && !r.linked).map(r => ({ aid: r.aid, storage: r.storage, url: r.url })));
sharedFake.on("attachments", "deleteMany", async ({ where }: { where: { aid: { in: number[] }; contentattachments: { none: object } } }) => {
  const before = rows.length;
  rows = rows.filter(r => !(where.aid.in.includes(r.aid) && !r.linked));
  return { count: before - rows.length };
});

const { deleteOrphanAttachments } = await import("#server/utils/attachment-cleanup");

describe("deleteOrphanAttachments(孤儿快照语义)", () => {
  test("无输入/空数组返回 0", async () => {
    expect(await deleteOrphanAttachments([])).toBe(0);
    expect(await deleteOrphanAttachments([Number.NaN])).toBe(0);
  });

  test("只删无关联的孤儿;已关联的保留;文件不存在的 url 静默(ENOENT)", async () => {
    rows = [
      { aid: 1, storage: "local", url: "/uploads/1.txt", linked: false },
      { aid: 2, storage: "local", url: "/uploads/2.txt", linked: true },
      { aid: 3, storage: "local", url: "/uploads/gone.txt", linked: false },
    ];
    expect(await deleteOrphanAttachments([1, 2, 3])).toBe(2);
  });

  test("重复 aid 去重;全非孤儿返回 0", async () => {
    rows = [
      { aid: 5, storage: "local", url: "/uploads/5.txt", linked: false },
    ];
    expect(await deleteOrphanAttachments([5, 5, 5.5])).toBe(1);
    rows = [{ aid: 6, storage: "local", url: "/uploads/6.txt", linked: true }];
    expect(await deleteOrphanAttachments([6])).toBe(0);
  });
});
