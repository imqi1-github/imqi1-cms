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

const UTF8 = new TextDecoder("utf-8");
const IPV4_MAPPED_PREFIX = 0xffffn << 32n;
const UNKNOWN_FIELDS = IPDB_FIELDS.map(() => "");
const LOCATION_SEPARATOR = /[-‐‑‒–—―|]/;

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
  ipv4Ipdb: string;
  ipv6wryDb: string;
  output: string;
  verify: boolean;
  samples: string[];
};

function usage(): string {
  return `Usage:
  bun tsx scripts/merge-ipv6wry-to-ipdb.ts --output data/qqwry.ipdb

Options:
  --ipv4-ipdb <file>     IPv4 source IPDB. Default: data/qqwry2.ipdb if present, otherwise data/qqwry.ipdb
  --ipv6wry-db <file>    IPv6 source. Default: data/ipv6wry.db
  --output <file>        Output IPDB path. Default: data/qqwry.ipdb
  --no-verify            Skip generated IPDB verification.
  --sample <ip>          Query a sample IP after writing. Can repeat.
  --help                 Show this help.
`;
}

function parseArgs(argv: string[]): CliOptions {
  const defaultIpv4Ipdb = existsSync(resolve("data", "qqwry2.ipdb"))
    ? resolve("data", "qqwry2.ipdb")
    : resolve("data", "qqwry.ipdb");
  const options: CliOptions = {
    ipv4Ipdb: defaultIpv4Ipdb,
    ipv6wryDb: resolve("data", "ipv6wry.db"),
    output: resolve("data", "qqwry.ipdb"),
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
      case "--ipv4-ipdb":
        options.ipv4Ipdb = resolve(next());
        break;
      case "--ipv6wry-db":
        options.ipv6wryDb = resolve(next());
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

class IpdbIpv4RangeReader {
  private readonly data: Buffer;
  private readonly meta: { node_count: number; v4node?: number; fields: string[]; ip_version: number };
  private readonly recordCache = new Map<number, IpdbFields>();

  constructor(path: string) {
    const file = readFileSync(path);
    const metaLength = file.readUInt32BE(0);
    this.meta = JSON.parse(file.subarray(4, 4 + metaLength).toString("utf8"));
    this.data = file.subarray(4 + metaLength);

    if ((this.meta.ip_version & 1) !== 1) throw new Error(`${path} does not support IPv4`);
    if (!this.meta.v4node) throw new Error(`${path} does not contain v4node`);
  }

  ranges(): Range[] {
    const ranges: Range[] = [];
    this.walk(this.meta.v4node!, 0, 0n, ranges);
    return mergeRanges(ranges);
  }

  private walk(node: number, depth: number, prefix: bigint, ranges: Range[]) {
    if (node === 0 && depth > 0) return;

    if (node >= this.meta.node_count) {
      ranges.push({
        version: 4,
        start: prefix << BigInt(32 - depth),
        end: ((prefix + 1n) << BigInt(32 - depth)) - 1n,
        fields: this.resolve(node),
      });
      return;
    }

    if (depth >= 32) {
      ranges.push({
        version: 4,
        start: prefix,
        end: prefix,
        fields: this.resolve(this.readNode(node, 0)),
      });
      return;
    }

    this.walk(this.readNode(node, 0), depth + 1, prefix << 1n, ranges);
    this.walk(this.readNode(node, 1), depth + 1, (prefix << 1n) | 1n, ranges);
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

class Ipv6wryReader {
  private readonly data: Buffer;
  private readonly indexBaseOffset: number;
  private readonly addressSegmentLength: number;
  readonly count: number;

  constructor(path: string) {
    this.data = readFileSync(path);
    if (this.data.subarray(0, 4).toString("ascii") !== "IPDB") {
      throw new Error("invalid ipv6wry.db magic");
    }

    const ipLength = this.data[7];
    if (ipLength !== 8) throw new Error(`unsupported ipv6wry.db ip length: ${ipLength}`);

    this.count = Number(this.data.readBigUInt64LE(8));
    this.indexBaseOffset = Number(this.data.readBigUInt64LE(16));
    const realCount = Math.floor((this.data.length - this.indexBaseOffset) / 11);
    this.addressSegmentLength = this.data[4] === 1 ? 2 : this.data[24];

    if (!this.count || realCount <= 0 || this.indexBaseOffset <= 0 || this.indexBaseOffset >= this.data.length) {
      throw new Error("invalid ipv6wry.db index");
    }
  }

  ranges(): Range[] {
    const ranges: Range[] = [];

    for (let index = 0; index < this.count; index += 1) {
      const current = this.readIndex(index);
      const next = index + 1 < this.count ? this.readIndex(index + 1).ip : 1n << 64n;
      if (next <= current.ip) continue;

      const [location = "", isp = ""] = this.readRecord(current.offset);
      ranges.push({
        version: 6,
        start: current.ip << 64n,
        end: (next << 64n) - 1n,
        fields: normalizeRegion(location, isp),
      });
    }

    return mergeRanges(ranges);
  }

  private readIndex(index: number): { ip: bigint; offset: number } {
    const position = this.indexBaseOffset + index * 11;
    return {
      ip: this.data.readBigUInt64LE(position),
      offset: this.data[position + 8] | (this.data[position + 9] << 8) | (this.data[position + 10] << 16),
    };
  }

  private readRecord(offset: number): string[] {
    const result: string[] = [];
    let position = offset;

    for (let i = 0; i < this.addressSegmentLength; i += 1) {
      const type = this.data[position];
      if (type === 2) {
        result.push(this.readCString(this.readUInt24LE(position + 1)));
        position += 4;
      } else {
        result.push(this.readCString(position));
        position += stringBytesLength(this.data, position);
      }
    }

    return result;
  }

  private readCString(offset: number): string {
    if (!offset || offset >= this.data.length) return "";
    const end = this.data.indexOf(0, offset);
    if (end < 0) return "";
    return UTF8.decode(this.data.subarray(offset, end)).trim();
  }

  private readUInt24LE(offset: number): number {
    return this.data[offset] | (this.data[offset + 1] << 8) | (this.data[offset + 2] << 16);
  }
}

function stringBytesLength(data: Buffer, offset: number): number {
  const end = data.indexOf(0, offset);
  return end < 0 ? 1 : end - offset + 1;
}

function normalizeRegion(location: string, isp: string): IpdbFields {
  const parts = splitLocation(normalizeToken(location));
  const [country = "", region = "", city = "", district = ""] = parts;
  return [country, region, city, district, "", normalizeToken(isp), "", ""];
}

function splitLocation(location: string): string[] {
  if (!location) return [];
  if (LOCATION_SEPARATOR.test(location)) return location.split(LOCATION_SEPARATOR).map(normalizeToken).filter(Boolean);
  return location.split(/[\s　]+/).map(normalizeToken).filter(Boolean).slice(0, 4);
}

function normalizeToken(value: string): string {
  return value
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
    sources: {
      ipv4: "ipdb",
      ipv6: "ipv6wry.db",
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

  if (!existsSync(options.ipv4Ipdb)) throw new Error(`IPv4 source IPDB not found: ${options.ipv4Ipdb}`);
  if (!existsSync(options.ipv6wryDb)) throw new Error(`ipv6wry.db not found: ${options.ipv6wryDb}`);

  console.log(`Reading IPv4 ranges from ${options.ipv4Ipdb}...`);
  const ipv4Ranges = new IpdbIpv4RangeReader(options.ipv4Ipdb).ranges();

  console.log(`Reading IPv6 ranges from ${options.ipv6wryDb}...`);
  const ipv6wry = new Ipv6wryReader(options.ipv6wryDb);
  const ipv6Ranges = ipv6wry.ranges();

  const ranges = mergeRanges([...ipv4Ranges, ...ipv6Ranges]);
  console.log(`Parsed ${ipv4Ranges.length} IPv4 ranges and ${ipv6Ranges.length} IPv6 ranges, merged to ${ranges.length}.`);
  console.log(`Writing ${options.output}...`);

  const buffer = serializeIpdb(ranges, Math.floor(Date.now() / 1000));
  await mkdir(dirname(options.output), { recursive: true });
  const tempOutput = `${options.output}.tmp-${process.pid}`;
  await writeFile(tempOutput, buffer);
  await rename(tempOutput, options.output);

  if (options.verify) verifyOutput(options.output, options.samples);

  console.log(`✓ Wrote ${(buffer.length / 1024 / 1024).toFixed(2)} MiB to ${options.output}`);
  console.log(`  IPv4 source ranges: ${ipv4Ranges.length}`);
  console.log(`  IPv6 source index entries: ${ipv6wry.count}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
