export interface IpLocationInfo {
  country: string;   // 国家或地区
  area: string;      // 运营商或具体位置
}

export interface IpDetail extends IpLocationInfo {
  beginIP: string;
  endIP: string;
}

export type IpdbData = {
  country_name?: string;
  region_name?: string;
  city_name?: string;
  district_name?: string;
  owner_domain?: string;
  isp_domain?: string;
  ip?: string;
  bitmask?: number;
};

export type CachedLocation = {
  value: IpDetail | null;
  expires: number;
};