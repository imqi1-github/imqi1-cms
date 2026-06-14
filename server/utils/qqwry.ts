/**
 * QQWry IP 库查询模块 (Node.js 版本)
 * 基于纯真 IP 数据库 (qqwry.dat)
 *
 * 文件格式:
 * - 前8字节: 索引区起始和结束偏移
 * - 索引区: 每条7字节 (4字节起始IP + 3字节记录偏移)
 * - 记录区: 包含IP段结束地址和地理位置信息
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { readFileSync } from "fs";
import * as iconv from "iconv-lite";

export interface IpLocationInfo {
  country: string;   // 国家或地区
  area: string;      // 运营商或具体位置
}

export interface IpDetail extends IpLocationInfo {
  beginIP: string;
  endIP: string;
}

class QQWry {
  private buffer: Buffer;
  private firstRecord: number;
  private lastRecord: number;
  private recordNum: number;

  constructor() {
    // 数据将在异步初始化时加载
    this.buffer = Buffer.alloc(0);
    this.firstRecord = 0;
    this.lastRecord = 0;
    this.recordNum = 0;
  }

  /**
   * 异步初始化，加载数据文件
   */
  async init(dataPath: string): Promise<void> {
    this.buffer = await readFile(dataPath);
    this.firstRecord = this.read4Byte(0);
    this.lastRecord = this.read4Byte(4);
    this.recordNum = (this.lastRecord - this.firstRecord) / 7;
  }

  /**
   * 从 Buffer 直接初始化（用于 Nitro storage）
   */
  initFromBuffer(buffer: Buffer): void {
    this.buffer = buffer;
    this.firstRecord = this.read4Byte(0);
    this.lastRecord = this.read4Byte(4);
    this.recordNum = (this.lastRecord - this.firstRecord) / 7;
  }

  /**
   * 读取4字节转为无符号整数 (小端序)
   */
  private read4Byte(offset: number): number {
    return this.buffer.readUInt32LE(offset);
  }

  /**
   * 读取3字节转为整数 (小端序)
   */
  private read3Byte(offset: number): number {
    return this.buffer.readUInt16LE(offset) |
           (this.buffer.readUInt8(offset + 2) << 16);
  }

  /**
   * 读取以 null 结尾的字符串，返回字符串和新的偏移量
   */
  private readStringWithOffset(offset: number): { str: string; newOffset: number } {
    let end = offset;
    while (this.buffer[end] !== 0) {
      end++;
    }
    const bytes = this.buffer.subarray(offset, end);
    return {
      str: iconv.decode(bytes, "gbk"),
      newOffset: end + 1, // 跳过 null 终止符
    };
  }

  /**
   * 读取以 null 结尾的字符串
   */
  private readString(offset: number): string {
    const end = this.buffer.indexOf(0, offset);
    if (end === -1) return "";
    const bytes = this.buffer.subarray(offset, end);
    return iconv.decode(bytes, "gbk");
  }

  /**
   * 获取记录的地理位置信息
   */
  private getRecord(offset: number): IpLocationInfo {
    const flag = this.buffer[offset + 4];

    if (flag === 1) {
      // dataA 和 dataB 都重定向
      const redirectOffset = this.read3Byte(offset + 5);
      const subFlag = this.buffer[redirectOffset];

      if (subFlag === 2) {
        // dataA 再次重定向
        const dataAOffset = this.read3Byte(redirectOffset + 1);
        const country = this.readString(dataAOffset);
        const area = this.getDataB(redirectOffset + 4);
        return { country, area };
      } else {
        // dataA 无重定向 - dataB 紧跟在 dataA 后面
        const { str: country, newOffset } = this.readStringWithOffset(redirectOffset);
        const area = this.getDataB(newOffset);
        return { country, area };
      }
    } else if (flag === 2) {
      // dataA 重定向
      const dataAOffset = this.read3Byte(offset + 5);
      const country = this.readString(dataAOffset);
      const area = this.getDataB(offset + 8);
      return { country, area };
    } else {
      // 无重定向 - dataB 紧跟在 dataA 后面
      const { str: country, newOffset } = this.readStringWithOffset(offset + 4);
      const area = this.getDataB(newOffset);
      return { country, area };
    }
  }

  /**
   * 获取 dataB (运营商信息)
   */
  private getDataB(offset: number): string {
    const flag = this.buffer[offset];

    if (flag === 0) {
      return "";
    } else if (flag === 1 || flag === 2) {
      const redirectOffset = this.read3Byte(offset + 1);
      return this.readString(redirectOffset);
    } else {
      return this.readString(offset);
    }
  }

  /**
   * 二分查找 IP 记录
   */
  private searchRecord(ipNum: number): number {
    let down = 0;
    let up = this.recordNum;

    while (down <= up) {
      const mid = Math.floor((down + up) / 2);
      const indexOffset = this.firstRecord + mid * 7;
      const beginIP = this.buffer.readUInt32LE(indexOffset);

      if (ipNum < beginIP) {
        up = mid - 1;
      } else {
        const recordOffset = this.read3Byte(indexOffset + 4);
        const endIP = this.read4Byte(recordOffset);

        if (ipNum > endIP) {
          down = mid + 1;
        } else {
          return indexOffset;
        }
      }
    }

    return this.lastRecord;
  }

  /**
   * IP 地址转为数字
   */
  private ipToNumber(ip: string): number {
    const parts = ip.split(".");
    return (
      (parseInt(parts[0] ?? "0") << 24) |
      (parseInt(parts[1] ?? "0") << 16) |
      (parseInt(parts[2] ?? "0") << 8) |
      parseInt(parts[3] ?? "0")
    ) >>> 0;
  }

  /**
   * 数字转为 IP 地址
   */
  private numberToIp(num: number): string {
    return [
      (num >>> 24) & 0xff,
      (num >>> 16) & 0xff,
      (num >>> 8) & 0xff,
      num & 0xff,
    ].join(".");
  }

  /**
   * 查询 IP 详细信息
   */
  public getDetail(ip: string): IpDetail | null {
    // 验证 IPv4 地址
    const ipv4Regex =
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    if (!match) return null;

    const ipNum = this.ipToNumber(ip);
    const indexOffset = this.searchRecord(ipNum);

    const beginIP = this.numberToIp(this.buffer.readUInt32LE(indexOffset));
    const recordOffset = this.read3Byte(indexOffset + 4);
    const endIP = this.numberToIp(this.read4Byte(recordOffset));

    const location = this.getRecord(recordOffset);

    // 清理特殊标识
    let { country, area } = location;
    if (country === "CZ88.NET" || country === "纯真网络") {
      country = "";
    }
    if (area === "CZ88.NET") {
      area = "";
    }

    return {
      beginIP,
      endIP,
      country: country.trim(),
      area: area.trim(),
    };
  }

  /**
   * 获取数据库版本日期
   */
  public getVersion(): string {
    const offset = this.read3Byte(this.lastRecord + 4);
    const data = this.readString(offset);
    // 格式: "xxxx年xx月xx日" 提取日期部分
    const match = data.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      return `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
    }
    return data;
  }
}

// 单例模式 + 内存缓存
let qqwryInstance: QQWry | null = null;
let initPromise: Promise<void> | null = null;

/**
 * 获取 QQWry 实例（自动初始化，带内存缓存）
 * 只使用 fs.readFileSync 读取，禁止 import/require
 */
async function getInstance(): Promise<QQWry> {
  if (!qqwryInstance) {
    qqwryInstance = new QQWry();
    if (!initPromise) {
      // QQWry.dat 文件路径（项目根目录的 data 文件夹，不在 Nuxt 管理范围内）
      // 开发环境: data/qqwry.dat
      // 生产环境: .output/data/qqwry.dat
      const dataPath = join(process.cwd(), "data", "qqwry.dat");
      initPromise = qqwryInstance.init(dataPath);
    }
    await initPromise;
  }
  return qqwryInstance;
}

/**
 * 查询 IP 归属地
 */
export async function queryIpLocation(ip: string): Promise<IpDetail | null> {
  try {
    const qqwry = await getInstance();
    return qqwry.getDetail(ip);
  } catch {
    // 静默失败，不打印错误日志
    return null;
  }
}

/**
 * 获取 IP 的简洁位置信息 (只返回地区和运营商)
 */
export async function getIpLocation(ip: string): Promise<{
  location: string;
  isp: string;
} | null> {
  const detail = await queryIpLocation(ip);
  if (!detail) return null;

  // country 通常包含省/市信息, area 包含运营商
  // 例如: country="北京市", area="电信"
  const location = detail.country || "";
  const isp = detail.area || "";

  return { location, isp };
}

/**
 * 获取数据库版本
 */
export async function getQQWryVersion(): Promise<string> {
  try {
    const qqwry = await getInstance();
    return qqwry.getVersion();
  } catch {
    return "未知";
  }
}
