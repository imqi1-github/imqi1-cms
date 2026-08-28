import { execSync } from 'child_process';
import https from 'https';

// 从 npm 获取包信息
const fetchPackageInfo = (packageName) => {
  return new Promise((resolve, reject) => {
    https.get(`https://registry.npmjs.org/${packageName}`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
};

// 获取 npm 过时包列表
const getOutdatedPackages = () => {
  try {
    const result = execSync('npm outdated --json', { encoding: 'utf8', timeout: 60000 });
    return JSON.parse(result);
  } catch (error) {
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        return {};
      }
    }
    return {};
  }
};

// 解析版本号用于比较：取 major.minor.patch，并把预发布（-rc/-beta 等）单独标记
const parseVersion = (version) => {
  const m = (version || "").match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
  if (!m) return { nums: [0, 0, 0], pre: "" };
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || "" };
};

// latest 是否比 current 新（numeric 逐级比较;numeric 相等时稳定版 > 预发布）
const isNewer = (latest, current) => {
  for (let i = 0; i < 3; i++) {
    const l = latest.nums[i] ?? 0;
    const c = current.nums[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return !latest.pre && !!current.pre;
};

// 主函数
const main = async () => {
  const outdated = getOutdatedPackages();
  const packageNames = Object.keys(outdated);

  if (packageNames.length === 0) {
    console.log('\n✅ 所有包都是最新的！\n');
    return;
  }

  console.log(`\n📦 发现 ${packageNames.length} 个包有更新:\n`);

  for (const name of packageNames) {
    const info = outdated[name];
    const currentV = parseVersion(info.current);
    const latestV = parseVersion(info.latest);

    let icon = '🟢';
    if (latestV.nums[0] > currentV.nums[0]) icon = '🔴';
    else if (isNewer(latestV, currentV)) icon = '🟡';

    try {
      const pkgInfo = await fetchPackageInfo(name);
      const latestVersion = pkgInfo['dist-tags']?.latest || info.latest;
      const versionInfo = pkgInfo.versions?.[latestVersion];

      console.log(`${icon} ${name}`);
      console.log(`   ${info.current} → ${info.latest}`);

      if (versionInfo) {
        // 尝试获取 release notes/changelog
        if (versionInfo.releaseNotes) {
          console.log(`   更新内容: ${versionInfo.releaseNotes}`);
        } else if (pkgInfo.changelog) {
          console.log(`   更新日志: ${pkgInfo.changelog}`);
        } else {
          // 显示仓库地址供查看
          const repo =
            typeof pkgInfo.repository === 'string'
              ? pkgInfo.repository
              : pkgInfo.repository?.url || pkgInfo.repository?.web;
          if (repo) {
            const cleanRepo = repo.replace(/^git\+/, '').replace(/\.git$/, '');
            console.log(`   查看更新: ${cleanRepo}/releases`);
          }
        }
      }
      console.log('');
    } catch {
      console.log(`${icon} ${name}: ${info.current} → ${info.latest}\n`);
    }
  }
};

main().catch(console.error);
