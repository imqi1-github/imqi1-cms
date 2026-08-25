import path from "node:path";

// 封面/附件 URL → 归一化 object key 候选集，供按 URL 匹配附件宽度/高度。
// 原在 4 个端点各复制一份（仅局部变量名/注释不同），收敛到此处避免日后只改一处而漂移。
const stripUrlDecorations = (value: string) => {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
};

const normalizePathname = (value: string) => {
  const clean = stripUrlDecorations(value);
  try {
    return new URL(clean).pathname;
  } catch {
    return clean;
  }
};

const normalizeObjectKey = (value: string) => {
  const normalized = normalizePathname(value).replace(/^\/+/, "");
  try {
    return decodeURIComponent(normalized);
  } catch {
    // 非法 % 编码（如 URI malformed）不应拖垮整个请求，回退到清理后的原始路径
    return normalized;
  }
};

export function buildUrlKeys(url: string): Set<string> {
  const key = normalizeObjectKey(url);
  const candidates = [key];

  if (!key.startsWith("uploads/")) {
    candidates.push(`uploads/${key}`);

    const fileName = path.basename(key);
    const datedName = /^(\d{4})-(\d{2})-\d{2}-/.exec(fileName);
    if (datedName) {
      candidates.push(`uploads/${datedName[1]}/${datedName[2]}/${fileName}`);
    }
  } else {
    candidates.push(key.replace(/^uploads\//, ""));
  }

  const fileName = path.basename(key);
  if (fileName) {
    candidates.push(fileName);
  }

  return new Set(candidates.filter(Boolean));
}

export function hasSharedUrlKey(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}
