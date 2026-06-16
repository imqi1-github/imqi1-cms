# 如何使用宝塔面板部署

这里以腾讯云服务器 OpenCloud 为例。

## 安装宝塔面板

前往 <https://www.bt.cn/new/download.html>，复制安装脚本，通过 ssh 连接到服务器，执行安装脚本。

由于 OpenCloud 兼容 Ubuntu，所以使用这条命令：

```bash
wget -O install_panel.sh https://download.bt.cn/install/install_panel.sh && sudo bash install_panel.sh ed8484bec
```

安装完成后，宝塔面板会提示用户名密码和登录入口，使用 bt 命令修改这些，以防泄漏。

## 需要安装的软件

登录宝塔面板，安装 MySQL、Redis（如果你要使用缓存）、Node.js 版本管理器、Nginx。

进入 Node.js 版本管理器，安装 Node.js 22 版本。

将 Node.js 添加到环境变量中，进入 Node.js 版本管理器，将**命令行版本**设置为 Node.js 22 版本。

## 本地打包

将 .env.example 复制为 .env，配置生产环境 Redis 配置，然后执行 `npm run build` 打包项目。

如果配置了 CDN，就将 public 目录下的文件上传到 CDN。

如果对象存储是 COS，可以在环境变量内配置 COS 相关的环境变量，然后用 `npm run upload:cos` 上传文件到 COS。

将 server 内的文件上传到服务器的 /www/wwwroot/glass 目录下。

## 创建项目

在宝塔面板内，创建数据库。

如果没有旧数据，就用 git clone 克隆项目到 /www/wwwroot/glass 目录下，然后安装依赖、执行 `npx prisma generate`、`npx prisma migrate deploy` 创建数据库，使用 `NODE_ENV=production npx prisma db seed` 初始化数据库。

在宝塔面板内，进入【网站】-【Node项目】，添加项目。

环境变量示例：

```shell
DATABASE_URL="mysql://nodejs:nodejs-imqi1@localhost:3306/nodejs"
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="nodejs"
DB_PASSWORD="nodejs-imqi1"
DB_NAME="nodejs"
PORT=4000
NODE_PROJECT_NAME="glass"
NODE_ENV="production"
UV_THREADPOOL_SIZE=64
```

端口选择 4000。

## 项目设置

配置域名、外网映射、伪静态规则、HTTPS。

伪静态示例：

```nginx
location = /sw.js {
    root /www/wwwroot/glass;
    add_header Cache-Control "no-cache";
}

# Workbox 相关脚本（关键）
location ^~ /workbox {
    root /www/wwwroot/glass;
    add_header Cache-Control "public, max-age=0, must-revalidate";
}

# 多目录统一处理
location ~ ^/(emojis|fonts|icons|imgs|skills)/ {
    return 302 https://cdn.imqi1.com$request_uri;
}

# 单文件
location = /favicon.ico {
    return 302 https://cdn.imqi1.com/favicon.ico;
}
```

反向代理示例：

```nginx
server
{
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen 443 quic;
    listen [::]:443 ssl;
    listen [::]:443 quic;
    http2 on;
    server_name imqi1.com;
    index index.html index.htm default.htm default.html;
    include /www/server/panel/vhost/nginx/extension/132/*.conf;
    #root /www/wwwroot/glass;
    #CERT-APPLY-CHECK--START
    # 用于SSL证书申请时的文件验证相关配置 -- 请勿删除
    include /www/server/panel/vhost/nginx/well-known/132.conf;
    #CERT-APPLY-CHECK--END


    #SSL-START SSL相关配置
    #error_page 404/404.html;
    ssl_certificate    /www/server/panel/vhost/cert/132/fullchain.pem;
    ssl_certificate_key    /www/server/panel/vhost/cert/132/privkey.pem;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000";
    add_header Alt-Svc 'quic=":443"; h3=":443"; h3-29=":443"; h3-27=":443";h3-25=":443"; h3-T050=":443"; h3-Q050=":443";h3-Q049=":443";h3-Q048=":443"; h3-Q046=":443"; h3-Q043=":443"';
    error_page 497  https://$host$request_uri;
    #HTTP_TO_HTTPS_START
    if ($server_port !~ 443){
        rewrite ^(/.*)$ https://$host$1 permanent;
    }
    #HTTP_TO_HTTPS_END
    #SSL-END

    #ERROR-PAGE-START  错误页相关配置
    #error_page 404 /404.html;
    #error_page 502 /502.html;
    #ERROR-PAGE-END


    #REWRITE-START 伪静态相关配置
    include /www/server/panel/vhost/rewrite/node_132.conf;
    #REWRITE-END

    #禁止访问的文件或目录
    location ~ ^/(\.user.ini|\.htaccess|\.git|\.svn|\.project|LICENSE|README.md|package.json|package-lock.json|\.env) {
        return 404;
    }

    #一键申请SSL证书验证目录相关设置
    location /.well-known/ {
        root  /www/wwwroot/glass;
    }

    #禁止在证书验证目录放入敏感文件
    if ( $uri ~ "^/\.well-known/.*\.(php|jsp|py|js|css|lua|ts|go|zip|tar\.gz|rar|7z|sql|bak)$" ) {
        return 403;
    }


    # HTTP反向代理相关配置开始 >>>
    location ~ /purge(/.*) {
        proxy_cache_purge cache_one $host$request_uri$is_args$args;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host:$server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header REMOTE-HOST $remote_addr;
        add_header X-Cache $upstream_cache_status;
        proxy_set_header X-Host $host:$server_port;
        proxy_set_header X-Scheme $scheme;
        proxy_connect_timeout 30s;
        proxy_read_timeout 86400s;
        proxy_send_timeout 30s;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    # HTTP反向代理相关配置结束 <<<

    access_log  /www/wwwlogs/132.log;
    error_log  /www/wwwlogs/132.error.log;
}
```

配置项目异常重启。
