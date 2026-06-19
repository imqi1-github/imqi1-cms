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

// 解析版本号用于比较
const parseVersion = (version) => {
  return version.replace(/[^0-9.]/g, '').split('.').map(Number);
};

// 比较版本号
const compareVersions = (v1, v2) => {
  const a = parseVersion(v1);
  const b = parseVersion(v2);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
    const currentParts = parseVersion(info.current);
    const latestParts = parseVersion(info.latest);

    let icon = '🟢';
    if (latestParts[0] > currentParts[0]) icon = '🔴';
    else if (latestParts[1] > currentParts[1]) icon = '🟡';

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
