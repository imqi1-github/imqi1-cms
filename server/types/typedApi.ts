import type { H3Event } from "h3";
import type { z, ZodType } from "zod";
import { createError, defineEventHandler, getQuery, readBody } from "h3";

/**
 * API 定义。
 * 响应类型直接由 Nitro InternalApi 推导，不做手写校验（response 字段曾为死字段，已删）。
 */
export interface TypedApiDefinition<
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
> {
  query?: TQuery;
  body?: TBody;
  description?: string;
}

/**
 * 从 schema 推导类型
 */
type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

/**
 * 安全输入结构
 */
type Validated<Q extends ZodType | undefined, B extends ZodType | undefined> = {
  query: Infer<Q>;
  body: Infer<B>;
};

export function defineTypedApiHandler<
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
  TResult = unknown,
>(
  definition: TypedApiDefinition<TQuery, TBody>,
  handler: (event: H3Event, validated: Validated<TQuery, TBody>) => TResult | Promise<TResult>,
) {
  return defineEventHandler(async (event: H3Event) => {
    let validatedQuery: Infer<TQuery> = undefined as Infer<TQuery>;
    let validatedBody: Infer<TBody> = undefined as Infer<TBody>;

    if (definition.query) {
      const result = definition.query.safeParse(getQuery(event));

      if (!result.success) {
        throw createError({
          statusCode: 400,
          message: "查询参数验证失败",
          data: result.error.issues,
        });
      }

      validatedQuery = result.data as Infer<TQuery>;
    }

    if (definition.body) {
      const rawBody = await readBody(event);
      const result = definition.body.safeParse(rawBody);

      if (!result.success) {
        throw createError({
          statusCode: 400,
          message: "请求体验证失败",
          data: result.error.issues,
        });
      }

      validatedBody = result.data as Infer<TBody>;
    }

    try {
      return await handler(event, {
        query: validatedQuery,
        body: validatedBody,
      });
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "statusCode" in error) {
        throw error;
      }

      console.error(error);

      throw createError({
        statusCode: 500,
        message: "服务器内部错误",
      });
    }
  });
}
