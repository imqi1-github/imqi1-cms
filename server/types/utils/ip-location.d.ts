export interface CityInfo {
  /** 城市名（去后缀，如「沈阳」）；只有省级时为 null */
  city: string | null;
  /** 省级名（去后缀，如「辽宁」「内蒙古」）；境外为 null */
  province: string | null;
  /** 是否国内（含港澳台） */
  isDomestic: boolean;
  /** 国家/地区名：国内为「中国」，境外为 qqwry 给的国名（中文或当地文字） */
  country: string;
}
