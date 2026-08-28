/**
 * 控制台欢迎横幅
 *
 * 在首页加载完成后向浏览器控制台输出站点名称与 ASCII 艺术字，
 * 供 `app.vue` 的 `onMounted` 调用。
 */
import { siteConfig } from "../site.config";

/** IMQI1 ASCII 艺术字横幅 */
const ASCII_BANNER =
  "██╗███╗   ███╗ ██████╗ ██╗ ██╗    ██████╗ ██████╗ ███╗   ███╗\n" +
  "██║████╗ ████║██╔═══██╗██║███║   ██╔════╝██╔═══██╗████╗ ████║\n" +
  "██║██╔████╔██║██║   ██║██║╚██║   ██║     ██║   ██║██╔████╔██║\n" +
  "██║██║╚██╔╝██║██║▄▄ ██║██║ ██║   ██║     ██║   ██║██║╚██╔╝██║\n" +
  "██║██║ ╚═╝ ██║╚██████╔╝██║ ██║██╗╚██████╗╚██████╔╝██║ ╚═╝ ██║\n" +
  "╚═╝╚═╝     ╚═╝ ╚══▀▀═╝ ╚═╝ ╚═╝╚═╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝";

/**
 * 在控制台输出站点欢迎信息与 ASCII 艺术字横幅。
 */
export function printWelcomeBanner(): void {
  console.log(
    `%c ${siteConfig.siteName}欢迎你的来访。`,
    "background: linear-gradient(270deg,#f9fafb,#eaecf0,#dddddd);padding:8px 15px;border-radius:8px;color:#222",
  );
  console.log(ASCII_BANNER);
}
