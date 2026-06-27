import type { z, ZodSchema } from "zod";
import type { EventHandler } from "h3";

/**
 * 类型化的 API 定义
 * 用于在服务端定义请求参数和响应的 schema
 */
export interface TypedApiDefinition<
  TQuery extends ZodSchema | undefined = undefined,
  TBody extends ZodSchema | undefined = undefined,
  TResponse extends ZodSchema | undefined = undefined,
> {
  /**
   * 查询参数 schema
   */
  query?: TQuery;
  /**
   * 请求体 schema
   */
  body?: TBody;
  /**
   * 响应 schema (可选，用于类型安全)
   */
  response?: TResponse;
  /**
   * 接口描述
   */
  description?: string;
}

/**
 * 定义类型化的 API 处理器
 *
 * @example
 * ```ts
 * export default defineTypedApiHandler({
 *   query: z.object({ q: z.string() }),
 *   description: "搜索接口",
 * }, async (event, { query }) => {
 *   // query 自动获得类型
 *   return { results: [] };
 * });
 * ```
 */
export function defineTypedApiHandler<
  TQuery extends ZodSchema | undefined = undefined,
  TBody extends ZodSchema | undefined = undefined,
  TResponse extends ZodSchema | undefined = undefined,
>(
  definition: TypedApiDefinition<TQuery, TBody, TResponse>,
  handler: (
    event: any,
    validated: {
      query: TQuery extends ZodSchema ? z.infer<TQuery> : undefined;
      body: TBody extends ZodSchema ? z.infer<TBody> : undefined;
    },
  ) => any,
): EventHandler<any> {
  return defineEventHandler(async (event: any) => {
    try {
      // 验证查询参数
      let validatedQuery: any = undefined;
      if (definition.query) {
        const query = getQuery(event);
        const result = definition.query.safeParse(query);
        if (!result.success) {
          throw createError({
            statusCode: 400,
            message: "查询参数验证失败",
            data: result.error.issues,
          });
        }
        validatedQuery = result.data;
      }

      // 验证请求体
      let validatedBody: any = undefined;
      if (definition.body) {
        const body = await readBody(event);
        const result = definition.body.safeParse(body);
        if (!result.success) {
          throw createError({
            statusCode: 400,
            message: "请求体验证失败",
            data: result.error.issues,
          });
        }
        validatedBody = result.data;
      }

      // 执行处理器
      const response = await handler(event, {
        query: validatedQuery,
        body: validatedBody,
      });

      return response;
    } catch (error) {
      // 如果已经是 H3 错误，直接抛出
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      // 其他错误包装为 500
      console.error(error);
      throw createError({
        statusCode: 500,
        message: "服务器内部错误",
      });
    }
  });
}
