import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import IPDBDefault from "ipdb";

const IPDB = typeof IPDBDefault === "function" ? IPDBDefault : (IPDBDefault as { default: typeof IPDBDefault }).default;

const IPDB_FIELDS = [
  "country_name",
  "region_name",
  "city_name",
  "district_name",
  "owner_domain",
  "isp_domain",
  "country_code",
  "continent_code",
] as const;

const IPV4_MAPPED_PREFIX = 0xffffn << 32n;
const UNKNOWN_FIELDS = IPDB_FIELDS.map(() => "");
const MUNICIPALITIES = new Set(["北京", "天津", "上海", "重庆"]);
const SPECIAL_REGIONS = new Set(["香港", "澳门", "台湾"]);

const DOMESTIC_ISP_RULES: Array<[RegExp, string]> = [
  [/移动|铁通/i, "移动"],
  [/联通|网通/i, "联通"],
  [/电信|天翼/i, "电信"],
  [/广电/i, "广电"],
  [/教育网|CERNET/i, "教育网"],
  [/科技网|CSTNET/i, "科技网"],
  [/阿里云|Alibaba/i, "阿里云"],
  [/腾讯云|Tencent/i, "腾讯云"],
  [/华为云|Huawei/i, "华为云"],
  [/百度云|Baidu/i, "百度云"],
  [/京东云|JD/i, "京东云"],
  [/火山云|Volc/i, "火山云"],
  [/金山云|Kingsoft/i, "金山云"],
  [/UCloud|优刻得/i, "UCloud"],
  [/鹏博士/i, "鹏博士"],
  [/长城宽带/i, "长城宽带"],
  [/方正宽带/i, "方正宽带"],
];

type IpVersion = 4 | 6;
type IpdbFields = string[];

type Range = {
  version: IpVersion;
  start: bigint;
  end: bigint;
  fields: IpdbFields;
};

type Cidr = {
  version: IpVersion;
  ip: bigint;
  prefix: number;
  fields: IpdbFields;
};

type TrieNode = {
  children: [number, number];
};

type CliOptions = {
  input: string;
  output: string;
  verify: boolean;
  samples: string[];
};

function usage(): string {
  return `Usage:
  bun tsx scripts/simplify-ipdb.ts --input data/qqwry.ipdb --output data/qqwry.ipdb

Options:
  --input <file>    Source IPDB. Default: data/qqwry.ipdb
  --output <file>   Output IPDB. Default: same as input
  --no-verify       Skip generated IPDB verification.
  --sample <ip>     Query a sample IP after writing. Can repeat.
  --help            Show this help.
`;
}

function parseArgs(argv: string[]): CliOptions {
  const input = resolve("data", "qqwry.ipdb");
  const options: CliOptions = {
    input,
    output: input,
    verify: true,
    samples: ["114.114.114.114", "8.8.8.8", "2400:3200::1", "2001:4860:4860::8888"],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      return value;
    };

    switch (arg) {
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      case "--input":
        options.input = resolve(next());
        if (options.output === input) options.output = options.input;
        break;
      case "--output":
        options.output = resolve(next());
        break;
      case "--no-verify":
        options.verify = false;
        break;
      case "--sample":
        options.samples.push(next());
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

class IpdbRangeReader {
  private readonly data: Buffer;
  private readonly meta: { node_count: number; v4node?: number; fields: string[]; ip_version: number; build?: number };
  private readonly recordCache = new Map<number, IpdbFields>();

  constructor(path: string) {
    const file = readFileSync(path);
    const metaLength = file.readUInt32BE(0);
    this.meta = JSON.parse(file.subarray(4, 4 + metaLength).toString("utf8"));
    this.data = file.subarray(4 + metaLength);
  }

  get build(): number {
    return this.meta.build || Math.floor(Date.now() / 1000);
  }

  ranges(): Range[] {
    const ranges: Range[] = [];

    if ((this.meta.ip_version & 2) === 2) {
      this.walk(0, 0, 0n, 128, 6, ranges, true);
    }

    if ((this.meta.ip_version & 1) === 1 && this.meta.v4node !== undefined) {
      this.walk(this.meta.v4node, 0, 0n, 32, 4, ranges, false);
    }

    return mergeRanges(ranges.map((range) => ({ ...range, fields: simplifyFields(range.fields) })));
  }

  private walk(
    node: number,
    depth: number,
    prefix: bigint,
    bits: number,
    version: IpVersion,
    ranges: Range[],
    skipMappedV4: boolean,
  ) {
    if (node === 0 && depth > 0) return;
    if (skipMappedV4 && depth === 96 && prefix === IPV4_MAPPED_PREFIX) return;

    if (node >= this.meta.node_count) {
      ranges.push({
        version,
        start: prefix << BigInt(bits - depth),
        end: ((prefix + 1n) << BigInt(bits - depth)) - 1n,
        fields: this.resolve(node),
      });
      return;
    }

    if (depth >= bits) {
      ranges.push({
        version,
        start: prefix,
        end: prefix,
        fields: this.resolve(this.readNode(node, 0)),
      });
      return;
    }

    this.walk(this.readNode(node, 0), depth + 1, prefix << 1n, bits, version, ranges, skipMappedV4);
    this.walk(this.readNode(node, 1), depth + 1, (prefix << 1n) | 1n, bits, version, ranges, skipMappedV4);
  }

  private readNode(node: number, bit: 0 | 1): number {
    return this.data.readUInt32BE((node << 3) | (bit << 2));
  }

  private resolve(pointer: number): IpdbFields {
    const cached = this.recordCache.get(pointer);
    if (cached) return cached;

    const offset = pointer + (this.meta.node_count << 3) - this.meta.node_count;
    const length = this.data.readUInt16BE(offset);
    const values = this.data.subarray(offset + 2, offset + 2 + length).toString("utf8").split("\t");
    const byName = new Map<string, string>();

    this.meta.fields.forEach((field, index) => byName.set(field, values[index] || ""));
    const fields = IPDB_FIELDS.map((field) => byName.get(field) || "");
    this.recordCache.set(pointer, fields);
    return fields;
  }
}

function simplifyFields(fields: IpdbFields): IpdbFields {
  const [country, region, city, district, owner, isp] = fields.map(normalizeToken);
  const domestic = isDomestic(country, region);
  const location = domestic
    ? simplifyDomesticLocation(country, region, city, district)
    : simplifyForeignLocation(country);
  const simplifiedIsp = domestic ? simplifyDomesticIsp(`${isp} ${owner}`) : (isp || owner);

  return [location, "", "", "", "", simplifiedIsp, "", ""];
}

function isDomestic(country: string, region: string): boolean {
  return country === "中国" || country.startsWith("中国") || SPECIAL_REGIONS.has(stripAdminSuffix(country)) || SPECIAL_REGIONS.has(stripAdminSuffix(region));
}

function simplifyDomesticLocation(country: string, region: string, city: string, district: string): string {
  const normalizedCountry = country.replace(/^中国/, "");
  const normalizedRegion = stripAdminSuffix(region || normalizedCountry);
  const normalizedCity = stripAdminSuffix(city);
  const normalizedDistrict = stripAdminSuffix(district);

  if (SPECIAL_REGIONS.has(normalizedCountry)) return normalizedCountry;
  if (SPECIAL_REGIONS.has(normalizedRegion)) return normalizedRegion;

  for (const municipality of MUNICIPALITIES) {
    if ([normalizedCountry, normalizedRegion, normalizedCity, normalizedDistrict].some((value) => value.includes(municipality))) {
      return municipality;
    }
  }

  if (normalizedCity) return normalizedCity;
  if (normalizedDistrict) return normalizedDistrict;
  return normalizedRegion || stripAdminSuffix(normalizedCountry) || "中国";
}

function simplifyForeignLocation(country: string): string {
  return stripAdminSuffix(country) || country;
}

function simplifyDomesticIsp(value: string): string {
  for (const [pattern, label] of DOMESTIC_ISP_RULES) {
    if (pattern.test(value)) return label;
  }
  return "";
}

function stripAdminSuffix(value: string): string {
  return normalizeToken(value)
    .replace(/^中国/, "")
    .replace(/特别行政区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/自治区$/, "")
    .replace(/省$/, "")
    .replace(/市$/, "")
    .replace(/自治州$/, "")
    .replace(/地区$/, "")
    .replace(/盟$/, "")
    .replace(/区$/, "")
    .replace(/县$/, "")
    .trim();
}

function normalizeToken(value: string): string {
  return (value || "")
    .replace(/CZ88\.NET/gi, "")
    .replace(/^IANA$/i, "")
    .replace(/^\(null\)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.version - b.version || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (
      last &&
      last.version === range.version &&
      last.end + 1n === range.start &&
      last.fields.join("\t") === range.fields.join("\t")
    ) {
      last.end = range.end;
      continue;
    }
    merged.push({ ...range });
  }

  return merged;
}

function trailingZeros(value: bigint, bits: number): number {
  if (value === 0n) return bits;
  let count = 0;
  while (count < bits && ((value >> BigInt(count)) & 1n) === 0n) count += 1;
  return count;
}

function rangeToCidrs(range: Range): Cidr[] {
  const bits = range.version === 4 ? 32 : 128;
  const cidrs: Cidr[] = [];
  let start = range.start;

  while (start <= range.end) {
    let blockBits = trailingZeros(start, bits);
    const remaining = range.end - start + 1n;
    while ((1n << BigInt(blockBits)) > remaining) blockBits -= 1;
    cidrs.push({ version: range.version, ip: start, prefix: bits - blockBits, fields: range.fields });
    start += 1n << BigInt(blockBits);
  }

  return cidrs;
}

function getBit(value: bigint, bits: number, index: number): 0 | 1 {
  return Number((value >> BigInt(bits - index - 1)) & 1n) as 0 | 1;
}

class IpdbTrieBuilder {
  private nodes: TrieNode[] = [{ children: [0, 0] }];
  private dataIds = new Map<string, number>();
  private dataPayloads: string[] = [];

  insertCidr(cidr: Cidr) {
    const dataId = this.addData(cidr.fields);
    if (cidr.version === 4) {
      const v4node = this.ensurePath(IPV4_MAPPED_PREFIX, 128, 96);
      this.insertAt(v4node, cidr.ip, 32, cidr.prefix, dataId);
      return;
    }

    this.insertAt(0, cidr.ip, 128, cidr.prefix, dataId);
  }

  build(): { nodes: TrieNode[]; records: Buffer; dataCount: number; v4node: number } {
    const v4node = this.ensurePath(IPV4_MAPPED_PREFIX, 128, 96);
    const unknownLeaf = this.leaf(this.addData(UNKNOWN_FIELDS));
    this.fillMissingChildren(unknownLeaf);

    const nodeCount = this.nodes.length;
    const offsets = new Map<number, number>();
    const recordBuffers: Buffer[] = [];
    let dataOffset = 0;

    for (let id = 0; id < this.dataPayloads.length; id += 1) {
      const payload = Buffer.from(this.dataPayloads[id], "utf8");
      if (payload.length > 0xffff) throw new Error(`IPDB data record exceeds 65535 bytes: ${payload.length}`);
      const record = Buffer.allocUnsafe(2 + payload.length);
      record.writeUInt16BE(payload.length, 0);
      payload.copy(record, 2);
      offsets.set(id, dataOffset);
      recordBuffers.push(record);
      dataOffset += record.length;
    }

    const encodedNodes = this.nodes.map((node) => ({ children: [...node.children] as [number, number] }));
    for (const node of encodedNodes) {
      for (let i = 0; i < 2; i += 1) {
        const child = node.children[i];
        if (child < 0) node.children[i] = nodeCount + (offsets.get(-child - 1) || 0);
      }
    }

    return {
      nodes: encodedNodes,
      records: Buffer.concat(recordBuffers),
      dataCount: this.dataPayloads.length,
      v4node,
    };
  }

  private addData(fields: IpdbFields): number {
    const payload = IPDB_FIELDS.map((_, index) => fields[index] || "").join("\t");
    const cached = this.dataIds.get(payload);
    if (cached !== undefined) return cached;
    const id = this.dataPayloads.length;
    this.dataPayloads.push(payload);
    this.dataIds.set(payload, id);
    return id;
  }

  private insertAt(rootNodeId: number, value: bigint, bits: number, prefixLength: number, dataId: number) {
    const leaf = this.leaf(dataId);
    if (prefixLength === 0) {
      this.nodes[rootNodeId].children = [leaf, leaf];
      return;
    }

    let nodeId = rootNodeId;
    for (let depth = 0; depth < prefixLength - 1; depth += 1) {
      nodeId = this.ensureInternalChild(nodeId, getBit(value, bits, depth));
    }

    this.nodes[nodeId].children[getBit(value, bits, prefixLength - 1)] = leaf;
  }

  private ensurePath(value: bigint, bits: number, prefixLength: number): number {
    let nodeId = 0;
    for (let depth = 0; depth < prefixLength; depth += 1) {
      nodeId = this.ensureInternalChild(nodeId, getBit(value, bits, depth));
    }
    return nodeId;
  }

  private ensureInternalChild(nodeId: number, bit: 0 | 1): number {
    const child = this.nodes[nodeId].children[bit];
    if (child > 0) return child;

    const nextId = this.nodes.length;
    this.nodes.push({ children: child < 0 ? [child, child] : [0, 0] });
    this.nodes[nodeId].children[bit] = nextId;
    return nextId;
  }

  private fillMissingChildren(leaf: number) {
    for (const node of this.nodes) {
      if (node.children[0] === 0) node.children[0] = leaf;
      if (node.children[1] === 0) node.children[1] = leaf;
    }
  }

  private leaf(dataId: number): number {
    return -(dataId + 1);
  }
}

function serializeIpdb(ranges: Range[], build: number): Buffer {
  const builder = new IpdbTrieBuilder();
  let cidrCount = 0;
  const insertOrder = [...ranges].sort((a, b) => b.version - a.version);

  for (const range of insertOrder) {
    const cidrs = rangeToCidrs(range);
    cidrCount += cidrs.length;
    for (const cidr of cidrs) builder.insertCidr(cidr);
  }

  const trie = builder.build();
  const metadata: Record<string, unknown> = {
    build,
    ip_version: 3,
    languages: { CN: 0 },
    fields: IPDB_FIELDS,
    node_count: trie.nodes.length,
    v4node: trie.v4node,
    total_size: 0,
    simplified: {
      range_count: ranges.length,
      cidr_count: cidrCount,
      data_count: trie.dataCount,
    },
  };

  const nodeBuffer = Buffer.allocUnsafe(trie.nodes.length * 8);
  trie.nodes.forEach((node, index) => {
    if (node.children[0] > 0xffffffff || node.children[1] > 0xffffffff) {
      throw new Error("IPDB node pointer exceeds uint32 capacity");
    }
    nodeBuffer.writeUInt32BE(node.children[0], index * 8);
    nodeBuffer.writeUInt32BE(node.children[1], index * 8 + 4);
  });

  let metaBuffer = Buffer.from(JSON.stringify(metadata), "utf8");
  let totalSize = 0;
  do {
    totalSize = 4 + metaBuffer.length + nodeBuffer.length + trie.records.length;
    metadata.total_size = totalSize;
    metaBuffer = Buffer.from(JSON.stringify(metadata), "utf8");
  } while (4 + metaBuffer.length + nodeBuffer.length + trie.records.length !== totalSize);

  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(metaBuffer.length, 0);
  return Buffer.concat([prefix, metaBuffer, nodeBuffer, trie.records]);
}

function verifyOutput(output: string, samples: string[]) {
  const ipdb = new IPDB(output);
  const meta = ipdb.meta as { fields?: string[]; ip_version?: number; languages?: Record<string, number> };

  if (meta.ip_version !== 3) throw new Error(`invalid ip_version: ${meta.ip_version}`);
  if (!meta.languages || meta.languages.CN !== 0) throw new Error("missing CN language offset");
  if (JSON.stringify(meta.fields) !== JSON.stringify(IPDB_FIELDS)) throw new Error("IPDB fields mismatch");

  console.log("\nSample lookups:");
  for (const sample of samples) {
    const result = ipdb.find(sample, { language: "CN" });
    console.log(`${sample.padEnd(40)} ${result.code === 0 ? JSON.stringify(result.data) : result.message}`);
    if (result.code !== 0) throw new Error(`sample lookup failed: ${sample}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(options.input)) throw new Error(`input IPDB not found: ${options.input}`);

  console.log(`Reading ranges from ${options.input}...`);
  const reader = new IpdbRangeReader(options.input);
  const ranges = reader.ranges();
  console.log(`Simplified to ${ranges.length} merged ranges.`);
  console.log(`Writing ${options.output}...`);

  const buffer = serializeIpdb(ranges, reader.build);
  await mkdir(dirname(options.output), { recursive: true });
  const tempOutput = `${options.output}.tmp-${process.pid}`;
  await writeFile(tempOutput, buffer);
  await rename(tempOutput, options.output);

  if (options.verify) verifyOutput(options.output, options.samples);

  console.log(`✓ Wrote ${(buffer.length / 1024 / 1024).toFixed(2)} MiB to ${options.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
