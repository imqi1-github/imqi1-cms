# Ubuntu PM2 部署指南

本文档详细说明如何在 Ubuntu 服务器上使用 PM2 部署 Nuxt 4 项目。

## 📋 目录

- [系统要求](#系统要求)
- [一、服务器准备](#一服务器准备)
- [二、安装依赖](#二安装依赖)
- [三、配置数据库](#三配置数据库)
- [四、部署项目](#四部署项目)
- [五、配置Nginx](#五配置nginx)
- [六、配置SSL证书](#六配置ssl证书)
- [七、PM2进程管理](#七pm2进程管理)
- [八、日常运维](#八日常运维)
- [九、常见问题](#九常见问题)

---

## 系统要求

- **操作系统**: Ubuntu 20.04+ / 22.04+
- **内存**: 至少 2GB RAM
- **存储**: 至少 20GB 可用空间
- **权限**: sudo 或 root 权限

---

## 一、服务器准备

### 1.1 更新系统

```bash
# 更新软件包列表
sudo apt update

# 升级已安装的软件包
sudo apt upgrade -y

# 安装常用工具
sudo apt install -y curl wget git vim unzip build-essential
```

### 1.2 创建部署用户（可选）

```bash
# 创建新用户（推荐，不建议直接使用root）
sudo adduser imqi1

# 添加到sudo组
sudo usermod -aG sudo imqi1

# 切换到新用户
su - imqi1
```

---

## 二、安装依赖

### 2.1 安装 Node.js

```bash
# 安装 Node.js 20.x (推荐使用 Node.js 20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node -v  # 应该显示 v20.x.x
npm -v   # 应该显示 10.x.x
```

### 2.2 安装 Bun（可选，用于包管理）

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 重新加载环境变量
source ~/.bashrc

# 验证安装
bun -v
```

### 2.3 安装 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 验证安装
pm2 -v

# 设置 PM2 开机自启
pm2 startup
# 复制输出的命令并执行，例如：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u imqi1 --hp /home/imqi1
```

### 2.4 安装 MySQL

```bash
# 安装 MySQL Server
sudo apt install -y mysql-server

# 启动 MySQL 服务
sudo systemctl start mysql
sudo systemctl enable mysql

# 安全配置
sudo mysql_secure_installation

# 登录 MySQL
sudo mysql

# 在 MySQL 命令行中执行：
CREATE DATABASE imqi1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'imqi1'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON imqi1.* TO 'imqi1'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# 测试连接
mysql -u imqi1 -p imqi1
```

---

## 三、配置数据库

### 3.1 准备数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库和用户（如果还没有）
CREATE DATABASE imqi1 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'imqi1'@'localhost' IDENTIFIED BY 'your_strong_password';
GRANT ALL PRIVILEGES ON imqi1.* TO 'imqi1'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 四、部署项目

### 4.1 克隆项目代码

```bash
# 方式1: 使用 Git（推荐）
cd ~
git clone https://github.com/yourusername/imqi1.git
cd imqi1

# 方式2: 上传项目包
# 在本地打包项目：
# tar -czf imqi1.tar.gz --exclude=node_modules --exclude=.git --exclude=.output .
#
# 上传到服务器：
# scp imqi1.tar.gz imqi1@your-server:/home/imqi1/
#
# 在服务器上解压：
# cd ~
# tar -xzf imqi1.tar.gz
# cd imqi1
```

### 4.2 安装项目依赖

```bash
# 方式1: 使用 Bun（推荐，速度更快）
bun install

# 方式2: 使用 npm
npm install

# 如果遇到权限问题
chmod +x node_modules/.bin/prisma
```

### 4.3 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

**必须配置的环境变量：**

```bash
# 数据库连接
DATABASE_URL="mysql://imqi1:your_strong_password@localhost:3306/imqi1"
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="imqi1"
DB_PASSWORD="your_strong_password"
DB_NAME="imqi1"

# 管理员账户
SEED_ADMIN_NAME="棋"
SEED_ADMIN_MAIL="your_email@qq.com"
SEED_ADMIN_PASSWORD="your_strong_password"

# 网站基本信息
SEED_SITE_NAME="ImQi1"
SEED_SITE_URL="https://yourdomain.com"
```

### 4.4 数据库迁移和初始化

```bash
# 生成 Prisma Client
bunx prisma generate

# 执行数据库迁移
bunx prisma migrate deploy

# 初始化数据（管理员账户、默认设置等）
bun run db:migrate

# （可选）打开 Prisma Studio 管理数据库
bun run prisma:studio
```

### 4.5 构建项目

```bash
# 构建生产版本
bun run build

# 验证构建输出
ls -la .output/server/index.mjs
```

### 4.6 创建必要的目录

```bash
# 创建日志目录
mkdir -p logs

# 创建上传目录（如果使用本地存储）
mkdir -p public/uploads
```

### 4.7 测试运行

```bash
# 测试启动
NODE_ENV=production PORT=4000 node .output/server/index.mjs

# 如果正常，按 Ctrl+C 停止
```

### 4.8 使用 PM2 启动

```bash
# 启动应用
pm2 start ecosystem.config.cjs

# 查看状态
pm2 status

# 查看日志
pm2 logs imqi1-nuxt

# 保存 PM2 进程列表
pm2 save
```

---

## 五、配置Nginx

### 5.1 安装 Nginx

```bash
# 安装 Nginx
sudo apt install -y nginx

# 启动 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 5.2 创建站点配置

```bash
# 创建配置文件
sudo vim /etc/nginx/sites-available/imqi1
```

**配置内容：**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # 日志文件
    access_log /var/log/nginx/imqi1-access.log;
    error_log /var/log/nginx/imqi1-error.log;

    # 反向代理到 Nuxt 应用
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存（如果有）
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:4000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5.3 启用站点配置

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/imqi1 /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 六、配置SSL证书

### 6.1 使用 Certbot 安装 Let's Encrypt 证书（推荐）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书（会自动配置 Nginx）
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 按提示输入邮箱，同意条款

# 测试自动续期
sudo certbot renew --dry-run
```

### 6.2 手动配置 SSL（如果已有证书）

```bash
# 编辑 Nginx 配置
sudo vim /etc/nginx/sites-available/imqi1
```

**添加 SSL 配置：**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL 证书配置
    ssl_certificate /path/to/your/fullchain.pem;
    ssl_certificate_key /path/to/your/privkey.pem;

    # SSL 优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 其他配置同上...
    location / {
        proxy_pass http://127.0.0.1:4000;
        # ... 其他 proxy 配置
    }
}
```

---

## 七、PM2进程管理

### 7.1 PM2 基础命令

```bash
# 查看所有进程状态
pm2 status
pm2 list

# 查看详细信息
pm2 show imqi1-nuxt

# 查看实时日志
pm2 logs imqi1-nuxt
pm2 logs imqi1-nuxt --lines 100

# 监控面板
pm2 monit
```

### 7.2 重启和停止

```bash
# 零停机重启（推荐，生产环境）
pm2 reload imqi1-nuxt
pm2 reload ecosystem.config.cjs

# 普通重启
pm2 restart imqi1-nuxt

# 停止
pm2 stop imqi1-nuxt

# 删除
pm2 delete imqi1-nuxt
```

### 7.3 开机自启动

```bash
# 保存当前进程列表
pm2 save

# 生成开机启动脚本（首次配置时执行）
pm2 startup
# 按提示执行输出的命令

# 移除开机启动
pm2 unstartup
```

---

## 八、日常运维

### 8.1 更新项目

```bash
# 1. 备份数据库
mysqldump -u imqi1 -p imqi1 > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 拉取最新代码
git pull origin main

# 3. 安装依赖
bun install

# 4. 重新构建
bun run build

# 5. 重启服务（零停机）
pm2 reload imqi1-nuxt

# 6. 清理缓存
pm2 flush
```

### 8.2 数据库备份

```bash
# 手动备份
mysqldump -u imqi1 -p imqi1 > backup_$(date +%Y%m%d).sql

# 设置自动备份（添加到 crontab）
crontab -e

# 添加每天凌晨2点自动备份
0 2 * * * mysqldump -u imqi1 -p'your_password' imqi1 > /home/imqi1/backups/imqi1_$(date +\%Y\%m\%d).sql
```

### 8.3 监控和日志

```bash
# 查看PM2监控
pm2 monit

# 查看最近的错误日志
pm2 logs imqi1-nuxt --err --lines 50

# 查看Nginx访问日志
sudo tail -f /var/log/nginx/imqi1-access.log

# 查看Nginx错误日志
sudo tail -f /var/log/nginx/imqi1-error.log
```

### 8.4 性能优化

```bash
# 查看内存使用
pm2 show imqi1-nuxt

# 如果内存占用过高，可以设置内存限制
pm2 restart imqi1-nuxt --max-memory-restart 1G

# 或修改 ecosystem.config.cjs：
# max_memory_restart: '1G'
```

---

## 九、常见问题

### 9.1 端口被占用

```bash
# 查看端口占用
sudo netstat -tulpn | grep :4000

# 如果被占用，杀死进程
sudo kill -9 <PID>

# 或修改 .env 中的 PORT 配置
PORT=3000
```

### 9.2 数据库连接失败

```bash
# 检查 MySQL 状态
sudo systemctl status mysql

# 检查数据库是否创建
mysql -u imqi1 -p -e "SHOW DATABASES;"

# 检查防火墙
sudo ufw allow 3306

# 测试连接
mysql -u imqi1 -p -h localhost imqi1
```

### 9.3 PM2 进程崩溃重启

```bash
# 查看崩溃日志
pm2 logs imqi1-nuxt --err --lines 100

# 常见原因：
# 1. 数据库未启动 → 启动 MySQL
# 2. 环境变量未配置 → 检查 .env 文件
# 3. 端口冲突 → 修改 PORT
# 4. 内存溢出 → 增加 swap 或优化代码
```

### 9.4 Nginx 502 错误

```bash
# 检查 Nuxt 应用是否运行
pm2 status

# 检查端口是否正确
netstat -tulpn | grep :4000

# 重启应用
pm2 restart imqi1-nuxt

# 检查 Nginx 配置
sudo nginx -t
sudo systemctl reload nginx
```

### 9.5 构建失败

```bash
# 清理缓存和重新构建
rm -rf .output node_modules
bun install
bun run build

# 如果 Node 版本不匹配
nvm install 20
nvm use 20
```

### 9.6 静态资源404

```bash
# 检查 public 目录权限
ls -la public/

# 确保构建输出包含静态资源
ls -la .output/public/

# 检查 Nginx 配置中的静态文件路径
```

---

## 附录：完整部署脚本

为了方便部署，可以使用以下一键部署脚本：

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 开始部署 ImQi1 项目..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 未安装，正在安装..."
    sudo npm install -g pm2
    pm2 startup
fi

# 安装依赖
echo "📦 安装项目依赖..."
bun install

# 生成 Prisma Client
echo "🔧 生成 Prisma Client..."
bunx prisma generate

# 构建项目
echo "🏗️  构建项目..."
bun run build

# 创建日志目录
mkdir -p logs

# 启动应用
echo "🚀 启动应用..."
pm2 start ecosystem.config.cjs
pm2 save

echo "✅ 部署完成！"
echo ""
echo "📊 应用状态："
pm2 status
```

**使用方法：**

```bash
# 赋予执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

---

## 相关资源

- [PM2 官方文档](https://pm2.keymetrics.io/)
- [Nuxt 4 部署文档](https://nuxt.com/docs/getting-started/deployment)
- [Nginx 反向代理配置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Let's Encrypt 证书](https://letsencrypt.org/)

---

## 技术支持

如果遇到问题：

1. 查看日志：`pm2 logs imqi1-nuxt --lines 100`
2. 检查配置：确保 `.env` 文件正确
3. 重启服务：`pm2 restart imqi1-nuxt`
4. 查看文档：[项目 GitHub Issues](https://github.com/yourusername/imqi1/issues)
