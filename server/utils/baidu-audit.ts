import { prisma } from "#server/utils/prisma";
import type { BaiduAuditResult, AuditConfig } from "#server/types/utils/baidu-audit";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(apiKey: string, secretKey: string): Promise<string | null> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  try {
    const response = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const data = await response.json();

    if (data.access_token) {
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 300) * 1000,
      };
      return data.access_token;
    }

    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getAuditConfig(): Promise<AuditConfig> {
  const keys = ["moderationApiType", "baiduApiKey", "baiduSecretKey", "baiduCheckAdmin"];
  const meta = await prisma.informations.findMany({
    where: { key: { in: keys } },
  });

  const config: Record<string, string> = {};
  meta.forEach(meta => {
    config[meta.key] = meta.value;
  });

  return {
    enabled: config.moderationApiType === "2",
    apiKey: config.baiduApiKey || "",
    secretKey: config.baiduSecretKey || "",
    checkAdmin: config.baiduCheckAdmin === "true",
  };
}

export async function auditText(text: string): Promise<{ conclusion: string; conclusionType: number }> {
  const config = await getAuditConfig();

  if (!config.enabled) {
    return { conclusion: "审核未启用", conclusionType: 0 };
  }

  if (!config.apiKey || !config.secretKey) {
    return { conclusion: "审核配置不完整", conclusionType: 0 };
  }

  const accessToken = await getAccessToken(config.apiKey, config.secretKey);

  if (!accessToken) {
    return { conclusion: "审核服务异常", conclusionType: 0 };
  }

  try {
    const response = await fetch(`https://aip.baidubce.com/rest/2.0/solution/v1/text_censor/v2/user_defined?access_token=${accessToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `text=${encodeURIComponent(text)}`,
    });

    const result: BaiduAuditResult = await response.json();

    if (result.error_code) {
      console.error(result.error_msg);
      return { conclusion: "审核服务异常", conclusionType: 0 };
    }

    return {
      conclusion: result.conclusion || "未知",
      conclusionType: result.conclusionType || 0,
    };
  } catch (error) {
    console.error(error);
    return { conclusion: "审核服务异常", conclusionType: 0 };
  }
}

export function mapAuditResultToStatus(conclusionType: number): number {
  switch (conclusionType) {
    case 1:
      return 1;
    case 2:
      return 0;
    case 3:
      return 0;
    default:
      // 结论不确定（新版接口 4=待人工复核）或未知值 → 挂起待审（fail-closed），
      // 与 comments.post 提示「请等待审核」语义一致；原 default 直接发布属 fail-open
      return 0;
  }
}
