# Docker 部署指南

本文档介绍如何使用 Docker 和 Docker Compose 部署 Glass 博客系统。

## 📋 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用内存
- 至少 5GB 可用磁盘空间

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://gitee.com/imqi1-gitee/glass.git
cd glass
```

### 2. 配置环境变量

```bash
# 复制环境变量配置文件
cp .env.docker.example .env

# 编辑环境变量（至少修改数据库密码和管理员密码）
nano .env
```

**必须修改的配置：**

```env
# 数据库 root 密码（建议使用强密码）
MYSQL_ROOT_PASSWORD=your_strong_password

# 管理员邮箱
SEED_ADMIN_MAIL=admin@yourdomain.com

# 管理员密码
SEED_ADMIN_PASSWORD=your_admin_password
```

### 3. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

### 4. 初始化数据库

首次启动后，需要运行数据库迁移和种子数据：

```bash
# 进入应用容器
docker-compose exec app sh

# 运行数据库迁移
bun run prisma:migrate

# 初始化种子数据（创建管理员账户、默认设置等）
bun run prisma:seed

# 退出容器
exit
```

### 5. 访问应用

- **应用地址**: http://localhost:4001
- **phpMyAdmin**: http://localhost:8080（需使用 `--profile tools` 启动）

## 📦 服务说明

Docker Compose 包含以下服务：

| 服务名 | 容器名 | 端口 | 说明 |
|--------|--------|------|------|
| app | glass-app | 4001 | 应用服务 |
| mysql | glass-mysql | 3306 | MariaDB 数据库 |
| redis | glass-redis | 6379 | Redis 缓存 |
| phpmyadmin | glass-phpmyadmin | 8080 | 数据库管理工具（可选） |

## 🔧 常用命令

### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose stop

# 重启所有服务
docker-compose restart

# 停止并删除所有服务（数据会保留）
docker-compose down

# 停止并删除所有服务（包括数据卷）
docker-compose down -v
```

### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看应用服务日志
docker-compose logs -f app

# 查看最近 100 行日志
docker-compose logs --tail=100 app
```

### 进入容器

```bash
# 进入应用容器
docker-compose exec app sh

# 进入数据库容器
docker-compose exec mysql bash

# 进入 Redis 容器
docker-compose exec redis sh
```

### 数据库管理

```bash
# 使用 Prisma Studio（可视化数据库管理）
docker-compose exec app bun run prisma:studio

# 访问 http://localhost:5555

# 使用 mysql 命令行
docker-compose exec mysql mysql -uroot -p
```

### 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build

# 清理旧镜像
docker image prune -f
```

## 🗄️ 数据持久化

数据通过 Docker Volume 持久化存储：

- `mysql-data`: MySQL 数据库数据
- `redis-data`: Redis 持久化数据

### 备份数据

```bash
# 备份 MySQL 数据库
docker-compose exec mysql mysqldump -uroot -p${MYSQL_ROOT_PASSWORD} glass > backup_$(date +%Y%m%d).sql

# 备份 Volume
docker run --rm -v glass_mysql-data:/data -v $(pwd):/backup alpine tar czf /backup/mysql-data_$(date +%Y%m%d).tar.gz -C /data .
```

### 恢复数据

```bash
# 恢复 MySQL 数据库
cat backup_20240101.sql | docker-compose exec -T mysql mysql -uroot -p${MYSQL_ROOT_PASSWORD} glass

# 恢复 Volume
docker run --rm -v glass_mysql-data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql-data_20240101.tar.gz -C /data
```

## 🌐 生产环境部署

### 1. 修改环境变量

```env
# 使用强密码
MYSQL_ROOT_PASSWORD=very_strong_password_here

# 配置真实域名
SEED_SITE_URL=https://yourdomain.com

# 配置腾讯云 COS（推荐）
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_BUCKET=your_bucket
COS_REGION=ap-beijing
```

### 2. 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 配置 HTTPS（使用 Let's Encrypt）

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d yourdomain.com

# 自动续期
sudo certbot renew --dry-run
```

### 4. 启用 phpMyAdmin（可选）

```bash
# 使用 tools profile 启动
docker-compose --profile tools up -d
```

访问 http://localhost:8080 使用 phpMyAdmin：
- 服务器：mysql
- 用户名：root
- 密码：你在 .env 中设置的 MYSQL_ROOT_PASSWORD

## 🐛 故障排查

### 应用无法启动

```bash
# 查看应用日志
docker-compose logs app

# 检查数据库连接
docker-compose exec app ping mysql -c 3

# 检查环境变量
docker-compose exec app env | grep MYSQL
```

### 数据库连接失败

```bash
# 检查 MySQL 是否正常运行
docker-compose ps mysql

# 查看 MySQL 日志
docker-compose logs mysql

# 进入 MySQL 容器检查
docker-compose exec mysql mysql -uroot -p
```

### Redis 连接失败

```bash
# 检查 Redis 是否正常运行
docker-compose ps redis

# 测试 Redis 连接
docker-compose exec redis redis-cli ping
```

### 端口冲突

如果端口被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
services:
  app:
    ports:
      - "4002:4001"  # 改为其他端口

  mysql:
    ports:
      - "3307:3306"  # 改为其他端口
```

## 🔐 安全建议

1. **修改默认密码**
   - 修改 MYSQL_ROOT_PASSWORD
   - 修改 SEED_ADMIN_PASSWORD
   - 设置 REDIS_PASSWORD

2. **限制暴露端口**
   - 生产环境不要暴露 MySQL 和 Redis 端口
   - 删除或注释掉 docker-compose.yml 中的 ports 配置

3. **使用 HTTPS**
   - 配置 SSL 证书
   - 强制 HTTPS 重定向

4. **定期备份**
   - 设置自动备份任务
   - 备份到远程存储

5. **更新镜像**
   ```bash
   # 定期更新基础镜像
   docker-compose pull
   docker-compose up -d --build
   ```

## 📊 性能优化

### 1. 限制资源使用

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 2. 启用 Redis 缓存

确保 .env 中配置了 Redis：

```env
REDIS_HOST_PROD=redis
REDIS_PORT_PROD=6379
```

### 3. 配置 CDN

在 .env 中配置腾讯云 COS：

```env
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_BUCKET=your_bucket
COS_REGION=ap-beijing
```

## 📚 更多文档

- [PM2 部署指南](PM2-DEPLOYMENT.md)
- [更新日志](CHANGELOG_SUMMARY.md)
- [迁移指南](MIGRATE.md)
