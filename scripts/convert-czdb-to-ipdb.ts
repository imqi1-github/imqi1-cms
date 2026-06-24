import { createDecipheriv } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
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

const FILE_SIZE_PTR = 1;
const FIRST_INDEX_PTR = 5;
const HEADER_BLOCK_PTR = 9;
const END_INDEX_PTR = 13;
const SUPER_PART_LENGTH = 17;
const HYPER_HEADER_SIZE = 12;
const IPV4_MAPPED_PREFIX = 0xffffn << 32n;
const UNKNOWN_FIELDS = IPDB_FIELDS.map(() => "");

type IpVersion = 4 | 6;
type VerifyMode = "none" | "sample" | "full";
type IpdbFields = string[];

type CliOptions = {
  inputs: string[];
  ipv4?: string;
  ipv6?: string;
  output: string;
  key?: string;
  keyEnv?: string;
  verify: VerifyMode;
  samples: string[];
  allowSingleFamily: boolean;
  ignoreExpired: boolean;
  dumpRawRegions: number;
};

type CzdbRange = {
  version: IpVersion;
  start: bigint;
  end: bigint;
  fields: IpdbFields;
  rawRegion: string;
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

type CzdbPayload = {
  version: IpVersion;
  ranges: CzdbRange[];
  rawRegions: string[];
  source: string;
  header: {
    version: number;
    clientId: number;
    expirationDate: number;
    randomSize: number;
  };
};

class MsgpackReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  readLong(): bigint {
    const head = this.readByte();
    if (head <= 0x7f) return BigInt(head);
    if (head >= 0xe0) return BigInt(head - 0x100);

    switch (head) {
      case 0xcc:
        return BigInt(this.readByte());
      case 0xcd:
        return BigInt(this.readUIntBE(2));
      case 0xce:
        return BigInt(this.readUIntBE(4));
      case 0xcf:
        return this.readUInt64();
      case 0xd0:
        return BigInt(this.readIntBE(1));
      case 0xd1:
        return BigInt(this.readIntBE(2));
      case 0xd2:
        return BigInt(this.readIntBE(4));
      case 0xd3:
        return this.readInt64();
      default:
        throw new Error(`unsupported msgpack integer prefix 0x${head.toString(16)}`);
    }
  }

  readString(): string {
    const head = this.readByte();
    let length: number;

    if ((head & 0xe0) === 0xa0) {
      length = head & 0x1f;
    } else if (head === 0xd9) {
      length = this.readByte();
    } else if (head === 0xda) {
      length = this.readUIntBE(2);
    } else if (head === 0xdb) {
      length = this.readUIntBE(4);
    } else if (head === 0xc0) {
      return "";
    } else {
      throw new Error(`unsupported msgpack string prefix 0x${head.toString(16)}`);
    }

    const end = this.offset + length;
    if (end > this.data.length) throw new Error("msgpack string exceeds buffer");
    const value = Buffer.from(this.data.subarray(this.offset, end)).toString("utf8");
    this.offset = end;
    return value;
  }

  readArrayHeader(): number {
    const head = this.readByte();
    if ((head & 0xf0) === 0x90) return head & 0x0f;
    if (head === 0xdc) return this.readUIntBE(2);
    if (head === 0xdd) return this.readUIntBE(4);
    throw new Error(`unsupported msgpack array prefix 0x${head.toString(16)}`);
  }

  private readByte(): number {
    if (this.offset >= this.data.length) throw new Error("unexpected end of msgpack buffer");
    return this.data[this.offset++];
  }

  private readUIntBE(bytes: number): number {
    let value = 0;
    for (let i = 0; i < bytes; i += 1) value = value * 256 + this.readByte();
    return value;
  }

  private readIntBE(bytes: number): number {
    const unsigned = this.readUIntBE(bytes);
    const signBit = 2 ** (bytes * 8 - 1);
    const full = 2 ** (bytes * 8);
    return unsigned >= signBit ? unsigned - full : unsigned;
  }

  private readUInt64(): bigint {
    let value = 0n;
    for (let i = 0; i < 8; i += 1) value = (value << 8n) | BigInt(this.readByte());
    return value;
  }

  private readInt64(): bigint {
    const value = this.readUInt64();
    return value & (1n << 63n) ? value - (1n << 64n) : value;
  }
}

function usage(): string {
  return `Usage:
  bun tsx scripts/convert-czdb-to-ipdb.ts --ipv4 ./ipv4.czdb --ipv6 ./ipv6.czdb --key-env CZDB_KEY --output ./data/qqwry.ipdb

Options:
  --input <file>              Add a CZDB file; version is auto-detected. Can repeat.
  --ipv4 <file>               Add an IPv4 CZDB file.
  --ipv6 <file>               Add an IPv6 CZDB file.
  --output <file>             Output IPDB path. Default: data/qqwry.ipdb
  --key <key>                 CZDB base64 key. Prefer --key-env for shell history safety.
  --key-env <name>            Read CZDB key from environment variable. Default: CZDB_KEY
  --verify <none|sample|full> Verify generated IPDB. Default: sample
  --sample <ip>               Query a sample IP after writing. Can repeat.
  --allow-single-family       Allow output with only IPv4 or only IPv6 data.
  --ignore-expired            Continue if the CZDB header is expired.
  --dump-raw-regions <n>      Print first n decoded CZDB region strings before writing.
  --help                      Show this help.
`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    output: resolve("data", "qqwry.ipdb"),
    keyEnv: "CZDB_KEY",
    verify: "sample",
    samples: [],
    allowSingleFamily: false,
    ignoreExpired: false,
    dumpRawRegions: 0,
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
        options.inputs.push(resolve(next()));
        break;
      case "--ipv4":
        options.ipv4 = resolve(next());
        options.inputs.push(options.ipv4);
        break;
      case "--ipv6":
        options.ipv6 = resolve(next());
        options.inputs.push(options.ipv6);
        break;
      case "--output":
        options.output = resolve(next());
        break;
      case "--key":
        options.key = next();
        break;
      case "--key-env":
        options.keyEnv = next();
        break;
      case "--verify": {
        const verify = next() as VerifyMode;
        if (!["none", "sample", "full"].includes(verify)) {
          throw new Error("--verify must be one of: none, sample, full");
        }
        options.verify = verify;
        break;
      }
      case "--sample":
        options.samples.push(next());
        break;
      case "--allow-single-family":
        options.allowSingleFamily = true;
        break;
      case "--ignore-expired":
        options.ignoreExpired = true;
        break;
      case "--dump-raw-regions":
        options.dumpRawRegions = Number.parseInt(next(), 10);
        if (!Number.isFinite(options.dumpRawRegions) || options.dumpRawRegions < 0) {
          throw new Error("--dump-raw-regions must be a non-negative integer");
        }
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.inputs = [...new Set(options.inputs)];
  options.key ||= options.keyEnv ? process.env[options.keyEnv] : undefined;
  return options;
}

function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] & 0xff) |
    ((buffer[offset + 1] << 8) & 0xff00) |
    ((buffer[offset + 2] << 16) & 0xff0000) |
    ((buffer[offset + 3] << 24) >>> 0)
  ) >>> 0;
}

function decryptAesEcb(key: string, data: Uint8Array): Buffer {
  const keyBytes = Buffer.from(key, "base64");
  const bits = keyBytes.length * 8;
  if (![128, 192, 256].includes(bits)) {
    throw new Error(`unsupported CZDB AES key length: ${keyBytes.length} bytes`);
  }

  const decipher = createDecipheriv(`aes-${bits}-ecb`, keyBytes, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function xorDecrypt(key: string, data: Uint8Array): Buffer {
  const keyBytes = Buffer.from(key, "base64");
  if (!keyBytes.length) throw new Error("empty CZDB key");

  const result = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i += 1) {
    result[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return result;
}

function currentYyMMdd(): number {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return Number(`${yy}${mm}${dd}`);
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function ipToBigint(ip: string): { version: IpVersion; value: bigint } {
  const version = isIP(ip);
  if (version === 4) {
    return {
      version,
      value: bytesToBigint(Buffer.from(ip.split(".").map((part) => Number.parseInt(part, 10)))),
    };
  }

  if (version === 6) {
    const [left, right = ""] = ip.toLowerCase().split("::", 2);
    const leftParts = left ? left.split(":") : [];
    const rightParts = right ? right.split(":") : [];
    const hasIpv4Tail = [...leftParts, ...rightParts].some((part) => part.includes("."));
    const expanded: number[] = [];

    function pushPart(part: string) {
      if (part.includes(".")) {
        const bytes = part.split(".").map((value) => Number.parseInt(value, 10));
        expanded.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
      } else {
        expanded.push(Number.parseInt(part || "0", 16));
      }
    }

    for (const part of leftParts) pushPart(part);
    const missing = 8 - expanded.length - rightParts.reduce((count, part) => count + (part.includes(".") ? 2 : 1), 0);
    for (let i = 0; i < missing; i += 1) expanded.push(0);
    for (const part of rightParts) pushPart(part);

    if (!hasIpv4Tail && expanded.length !== 8) throw new Error(`invalid IPv6 address: ${ip}`);

    let value = 0n;
    for (const part of expanded) value = (value << 16n) | BigInt(part);
    return { version, value };
  }

  throw new Error(`invalid IP address: ${ip}`);
}

function bigintToIp(value: bigint, version: IpVersion): string {
  if (version === 4) {
    return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join(".");
  }

  const parts: string[] = [];
  for (let i = 7; i >= 0; i -= 1) {
    parts.push(Number((value >> BigInt(i * 16)) & 0xffffn).toString(16));
  }
  return parts.join(":");
}

function parseHyperHeader(file: Uint8Array, key: string, ignoreExpired: boolean) {
  if (file.length < HYPER_HEADER_SIZE) throw new Error("CZDB file is too small");

  const version = readUInt32LE(file, 0);
  const clientId = readUInt32LE(file, 4);
  const encryptedBlockSize = readUInt32LE(file, 8);
  const encryptedStart = HYPER_HEADER_SIZE;
  const encryptedEnd = encryptedStart + encryptedBlockSize;
  if (encryptedEnd > file.length) throw new Error("CZDB encrypted header exceeds file size");

  const decrypted = decryptAesEcb(key, file.subarray(encryptedStart, encryptedEnd));
  const mixed = readUInt32LE(decrypted, 0);
  const decryptedClientId = mixed >> 20;
  const expirationDate = mixed & 0xfffff;
  const randomSize = readUInt32LE(decrypted, 4);

  if (decryptedClientId !== clientId) {
    throw new Error(`wrong CZDB key/clientId: expected ${clientId}, got ${decryptedClientId}`);
  }

  if (!ignoreExpired && expirationDate < currentYyMMdd()) {
    throw new Error(`CZDB is expired: ${expirationDate}`);
  }

  const payloadStart = encryptedEnd + randomSize;
  if (payloadStart > file.length) throw new Error("CZDB random block exceeds file size");

  return {
    payloadStart,
    header: { version, clientId, expirationDate, randomSize },
  };
}

function decodeRegion(region: Uint8Array, geoMapData: Uint8Array | null, columnSelection: number): string {
  try {
    const unpacker = new MsgpackReader(region);
    const geoPosMixSize = unpacker.readLong();
    const otherData = unpacker.readString();

    if (geoPosMixSize === 0n) return otherData;
    if (!geoMapData) return otherData;

    const dataLen = Number((geoPosMixSize >> 24n) & 0xffn);
    const dataPtr = Number(geoPosMixSize & 0x00ffffffn);
    const regionData = geoMapData.subarray(dataPtr, dataPtr + dataLen);
    const geoUnpacker = new MsgpackReader(regionData);
    const columnNumber = geoUnpacker.readArrayHeader();
    const columns: string[] = [];

    for (let i = 0; i < columnNumber; i += 1) {
      const selected = ((columnSelection >> (i + 1)) & 1) === 1;
      const value = normalizeToken(geoUnpacker.readString()) || "null";
      if (selected) columns.push(value);
    }

    return `${columns.join("\t")}${columns.length ? "\t" : ""}${otherData}`;
  } catch {
    return Buffer.from(region).toString("utf8");
  }
}

function normalizeToken(value: string): string {
  const token = value.trim();
  if (!token) return "";
  if (/^(?:null|none|unknown|cz88\.net|0)$/i.test(token)) return "";
  if (/^(?:未知|未分配|保留地址|局域网|本机地址)$/.test(token)) return "";
  return token;
}

const LOCATION_SEPARATOR = /[-‐‑‒–—―|]/;

function splitLocationParts(location: string): string[] {
  return location.split(LOCATION_SEPARATOR).map(normalizeToken).filter(Boolean);
}

function splitLocationAndIsp(raw: string): { location: string; isp: string } {
  const normalized = raw.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^(.*?)[\s　]+([^\s　]*(?:电信|联通|移动|铁通|广电|教育网|科技网|长城宽带|鹏博士|歌华|方正宽带|宽带|IDC|数据中心|Cloudflare|Google|Amazon|Microsoft|Facebook|Akamai|Cogent|Level3|Verizon|Comcast|AT&T|NTT|KDDI|SoftBank)[^\s　]*)$/i);
  if (!match) return { location: normalized, isp: "" };
  return { location: match[1].trim(), isp: normalizeToken(match[2]) };
}

function normalizeCzdbRegion(region: string): IpdbFields {
  const raw = region.replace(/\r?\n/g, " ").trim();
  if (!raw || normalizeToken(raw) === "") return [...UNKNOWN_FIELDS];

  const tabParts = raw.split("\t").map(normalizeToken).filter(Boolean);
  let parts: string[] = [];
  let isp = "";

  if (tabParts.length >= 2) {
    if (LOCATION_SEPARATOR.test(tabParts[0])) {
      parts = splitLocationParts(tabParts[0]);
      isp = normalizeToken(tabParts.slice(1).join(" "));
    } else {
      parts = tabParts.slice(0, 4);
      const tail = tabParts.slice(4).join(" ");
      isp = normalizeToken(tail) || normalizeToken(tabParts.at(-1) || "");
    }
  } else {
    const { location, isp: provider } = splitLocationAndIsp(raw);
    parts = splitLocationParts(location);
    isp = provider;
  }

  const [country = "", regionName = "", cityName = "", districtName = ""] = parts;

  return [
    country,
    regionName,
    cityName,
    districtName,
    "",
    isp,
    "",
    "",
  ];
}

async function readCzdb(source: string, key: string, ignoreExpired: boolean): Promise<CzdbPayload> {
  const file = await readFile(source);
  const { payloadStart, header } = parseHyperHeader(file, key, ignoreExpired);
  const db = file.subarray(payloadStart);

  if (db.length < SUPER_PART_LENGTH) throw new Error(`${source}: CZDB payload is too small`);

  const version: IpVersion = (db[0] & 1) === 0 ? 4 : 6;
  const ipBytesLength = version === 4 ? 4 : 16;
  const indexBlockLength = version === 4 ? 13 : 37;
  const fileSize = readUInt32LE(db, FILE_SIZE_PTR);
  const firstIndexPtr = readUInt32LE(db, FIRST_INDEX_PTR);
  const headerBlockSize = readUInt32LE(db, HEADER_BLOCK_PTR);
  const endIndexPtr = readUInt32LE(db, END_INDEX_PTR);

  if (fileSize !== db.length) {
    throw new Error(`${source}: payload size mismatch, header says ${fileSize}, actual ${db.length}`);
  }
  if (firstIndexPtr < SUPER_PART_LENGTH + headerBlockSize || endIndexPtr >= db.length) {
    throw new Error(`${source}: invalid index pointers`);
  }

  const columnSelectionPtr = endIndexPtr + indexBlockLength;
  let columnSelection = 0;
  let geoMapData: Buffer | null = null;

  if (columnSelectionPtr + 4 <= db.length) {
    columnSelection = readUInt32LE(db, columnSelectionPtr);
    if (columnSelection !== 0) {
      const geoMapPtr = columnSelectionPtr + 4;
      const geoMapSize = readUInt32LE(db, geoMapPtr);
      const encryptedGeoMap = db.subarray(geoMapPtr + 4, geoMapPtr + 4 + geoMapSize);
      geoMapData = xorDecrypt(key, encryptedGeoMap);
    }
  }

  const ranges: CzdbRange[] = [];
  const rawRegions: string[] = [];

  for (let offset = firstIndexPtr; offset <= endIndexPtr; offset += indexBlockLength) {
    const startBytes = db.subarray(offset, offset + ipBytesLength);
    const endBytes = db.subarray(offset + ipBytesLength, offset + ipBytesLength * 2);
    const dataPtr = readUInt32LE(db, offset + ipBytesLength * 2);
    const dataLen = db[offset + ipBytesLength * 2 + 4];
    if (!dataPtr || !dataLen || dataPtr + dataLen > db.length) continue;

    const rawRegion = decodeRegion(db.subarray(dataPtr, dataPtr + dataLen), geoMapData, columnSelection);
    const fields = normalizeCzdbRegion(rawRegion);
    ranges.push({
      version,
      start: bytesToBigint(startBytes),
      end: bytesToBigint(endBytes),
      fields,
      rawRegion,
    });
    if (rawRegions.length < 1000) rawRegions.push(rawRegion);
  }

  return { version, ranges, rawRegions, source, header };
}

function fieldKey(fields: IpdbFields): string {
  return fields.join("\t");
}

function mergeRanges(ranges: CzdbRange[]): CzdbRange[] {
  const sorted = [...ranges]
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.version - b.version || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: CzdbRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (
      last &&
      last.version === range.version &&
      last.end + 1n === range.start &&
      fieldKey(last.fields) === fieldKey(range.fields)
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

function rangeToCidrs(range: CzdbRange): Cidr[] {
  const bits = range.version === 4 ? 32 : 128;
  const cidrs: Cidr[] = [];
  let start = range.start;

  while (start <= range.end) {
    let blockBits = trailingZeros(start, bits);
    const remaining = range.end - start + 1n;
    while ((1n << BigInt(blockBits)) > remaining) blockBits -= 1;
    cidrs.push({
      version: range.version,
      ip: start,
      prefix: bits - blockBits,
      fields: range.fields,
    });
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

  add(fields: IpdbFields): number {
    const payload = IPDB_FIELDS.map((_, index) => fields[index] || "").join("\t");
    const cached = this.dataIds.get(payload);
    if (cached !== undefined) return cached;
    const id = this.dataPayloads.length;
    this.dataPayloads.push(payload);
    this.dataIds.set(payload, id);
    return id;
  }

  insertCidr(cidr: Cidr) {
    const dataId = this.add(cidr.fields);

    if (cidr.version === 4) {
      const v4node = this.ensurePath(IPV4_MAPPED_PREFIX, 128, 96);
      this.insertAt(v4node, cidr.ip, 32, cidr.prefix, dataId);
      return;
    }

    this.insertAt(0, cidr.ip, 128, cidr.prefix, dataId);
  }

  build(includeV4: boolean): { metaNodeCount: number; nodes: TrieNode[]; records: Buffer; dataCount: number; v4node?: number } {
    const v4node = includeV4 ? this.ensurePath(IPV4_MAPPED_PREFIX, 128, 96) : undefined;
    const unknownDataId = this.add(UNKNOWN_FIELDS);
    const unknownLeaf = this.leaf(unknownDataId);
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
        if (child < 0) {
          const dataId = -child - 1;
          node.children[i] = nodeCount + (offsets.get(dataId) || 0);
        }
      }
    }

    return {
      metaNodeCount: nodeCount,
      nodes: encodedNodes,
      records: Buffer.concat(recordBuffers),
      dataCount: this.dataPayloads.length,
      v4node,
    };
  }

  private insertAt(rootNodeId: number, value: bigint, bits: number, prefixLength: number, dataId: number) {
    const leaf = this.leaf(dataId);
    if (prefixLength === 0) {
      this.nodes[rootNodeId].children = [leaf, leaf];
      return;
    }

    let nodeId = rootNodeId;
    for (let depth = 0; depth < prefixLength - 1; depth += 1) {
      const bit = getBit(value, bits, depth);
      nodeId = this.ensureInternalChild(nodeId, bit);
    }

    const lastBit = getBit(value, bits, prefixLength - 1);
    this.nodes[nodeId].children[lastBit] = leaf;
  }

  private ensureInternalChild(nodeId: number, bit: 0 | 1): number {
    const child = this.nodes[nodeId].children[bit];
    if (child > 0) return child;

    const nextId = this.nodes.length;
    const inherited: [number, number] = child < 0 ? [child, child] : [0, 0];
    this.nodes.push({ children: inherited });
    this.nodes[nodeId].children[bit] = nextId;
    return nextId;
  }

  private ensurePath(value: bigint, bits: number, prefixLength: number): number {
    let nodeId = 0;
    for (let depth = 0; depth < prefixLength; depth += 1) {
      const bit = getBit(value, bits, depth);
      nodeId = this.ensureInternalChild(nodeId, bit);
    }
    return nodeId;
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

function serializeIpdb(ranges: CzdbRange[], outputIpVersion: number, build: number): Buffer {
  const builder = new IpdbTrieBuilder();
  let cidrCount = 0;

  for (const range of ranges) {
    const cidrs = rangeToCidrs(range);
    cidrCount += cidrs.length;
    for (const cidr of cidrs) builder.insertCidr(cidr);
  }

  const trie = builder.build((outputIpVersion & 1) === 1);
  const metadata: Record<string, unknown> = {
    build,
    ip_version: outputIpVersion,
    languages: { CN: 0 },
    fields: IPDB_FIELDS,
    node_count: trie.metaNodeCount,
    total_size: 0,
    czdb: {
      range_count: ranges.length,
      cidr_count: cidrCount,
      data_count: trie.dataCount,
    },
  };
  if (trie.v4node !== undefined) metadata.v4node = trie.v4node;

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

function assertOutputMeta(ipdb: InstanceType<typeof IPDB>, expectedIpVersion: number) {
  const meta = ipdb.meta as { fields?: string[]; languages?: Record<string, number>; ip_version?: number; node_count?: number };
  if (meta.ip_version !== expectedIpVersion) throw new Error(`ip_version mismatch: ${meta.ip_version}`);
  if (!meta.languages || meta.languages.CN !== 0) throw new Error("missing CN language offset");
  if (JSON.stringify(meta.fields) !== JSON.stringify(IPDB_FIELDS)) throw new Error("IPDB fields mismatch");
  if (!meta.node_count || meta.node_count <= 0) throw new Error("invalid IPDB node_count");
}

function sameFields(left: IpdbFields, right: Record<string, unknown>): boolean {
  return IPDB_FIELDS.every((field, index) => String(right[field] || "") === (left[index] || ""));
}

function pickVerificationRanges(ranges: CzdbRange[], mode: VerifyMode): CzdbRange[] {
  if (mode === "none") return [];
  if (mode === "full") return ranges;

  const selected = new Map<string, CzdbRange>();
  const add = (range: CzdbRange | undefined) => {
    if (!range) return;
    selected.set(`${range.version}:${range.start}:${range.end}`, range);
  };

  for (let i = 0; i < Math.min(50, ranges.length); i += 1) add(ranges[i]);
  for (let i = Math.max(0, ranges.length - 50); i < ranges.length; i += 1) add(ranges[i]);
  for (let i = 0; i < ranges.length; i += Math.max(1, Math.floor(ranges.length / 200))) add(ranges[i]);
  return [...selected.values()];
}

function verifyOutput(output: string, ranges: CzdbRange[], expectedIpVersion: number, mode: VerifyMode, samples: string[]) {
  const ipdb = new IPDB(output);
  assertOutputMeta(ipdb, expectedIpVersion);

  const checks = pickVerificationRanges(ranges, mode);
  let checked = 0;

  for (const range of checks) {
    const points = [range.start, range.end];
    if (range.end > range.start + 1n) points.push((range.start + range.end) >> 1n);

    for (const point of points) {
      const ip = bigintToIp(point, range.version);
      const result = ipdb.find(ip, { language: "CN" });
      if (result.code !== 0 || !sameFields(range.fields, result.data as Record<string, unknown>)) {
        throw new Error(`verification failed for ${ip}: ${JSON.stringify(result)}`);
      }
      checked += 1;
    }
  }

  if (samples.length) {
    console.log("\nSample lookups:");
    for (const sample of samples) {
      const result = ipdb.find(sample, { language: "CN" });
      console.log(`${sample.padEnd(40)} ${result.code === 0 ? JSON.stringify(result.data) : result.message}`);
    }
  }

  console.log(`✓ Verified IPDB metadata and ${checked} source-derived lookup points`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.inputs.length) throw new Error("at least one CZDB input is required\n" + usage());
  if (!options.key) options.key = 'v3NSpKbKimkLED5M8QC7gA=='

  for (const input of options.inputs) {
    if (!existsSync(input)) throw new Error(`input file not found: ${input}`);
  }

  console.log(`Reading ${options.inputs.length} CZDB file(s)...`);
  const payloads = await Promise.all(options.inputs.map((input) => readCzdb(input, options.key!, options.ignoreExpired)));
  const hasV4 = payloads.some((payload) => payload.version === 4);
  const hasV6 = payloads.some((payload) => payload.version === 6);

  if ((!hasV4 || !hasV6) && !options.allowSingleFamily) {
    throw new Error("refusing to write single-family IPDB. Provide both IPv4 and IPv6 CZDB files or pass --allow-single-family.");
  }

  if (options.dumpRawRegions > 0) {
    console.log("\nRaw CZDB regions:");
    for (const region of payloads.flatMap((payload) => payload.rawRegions).slice(0, options.dumpRawRegions)) {
      console.log(region);
    }
  }

  const ranges = mergeRanges(payloads.flatMap((payload) => payload.ranges));
  const outputIpVersion = (hasV4 ? 1 : 0) | (hasV6 ? 2 : 0);
  const build = Math.max(...payloads.map((payload) => payload.header.version), Math.floor(Date.now() / 1000));

  console.log(`Parsed ${payloads.reduce((sum, payload) => sum + payload.ranges.length, 0)} ranges, merged to ${ranges.length}.`);
  console.log(`Writing ${options.output}...`);

  const buffer = serializeIpdb(ranges, outputIpVersion, build);
  await mkdir(dirname(options.output), { recursive: true });
  const tempOutput = `${options.output}.tmp-${process.pid}`;
  await writeFile(tempOutput, buffer);
  await rename(tempOutput, options.output);

  if (options.verify !== "none") {
    verifyOutput(options.output, ranges, outputIpVersion, options.verify, options.samples);
  }

  console.log(`✓ Wrote ${(buffer.length / 1024 / 1024).toFixed(2)} MiB to ${options.output}`);
  for (const payload of payloads) {
    console.log(`  IPv${payload.version}: ${payload.ranges.length} ranges from ${payload.source}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
