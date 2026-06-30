/** 标准响应包装 */
export type StandardResponse<T> = {
  code: number;
  message: string;
  data: T;
};
