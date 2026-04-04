## 数据库模型

友情链接类，字段id name desc link avatar enabled
订阅列表类，字段id url name avatar
更新日志类，字段id class desc create_time
文章类，字段cid title desc content create_time update_time status comment_num many_covers covers show_toc
评论类，字段coid cid name link avatar content create_time status parent_id agent ip
分类/话题类，字段mid name desc class
关系类，字段cid mid
用户类 字段id name avatar mail password create auth_code role
元数据类，字段id key value

## 提示词

现在我想将旧主题的首页移植到新主题中，请你完成，旧主题的位置位于.old-theme中，旧主题分为两部分，一部分是NewImQi1，是一个Typecho主题，它里面有一个index.php，就是首页的php文件，还有一个A:\nodejs-imqi1\.old-theme\js-dev\main\main\src\components\pages\indexPage.js，这个是初始化与首页有关的函数，请你帮我完成迁移工作，将首页移动至index.vue中，你需要先弄清楚首页的html结构和所有样式，然后将它们复制到index.vue中，然后使用vue的语法给它们绑定事件，以及用tailwindcss替代原生css，要保证新的首页和之前的首页效果一致，如果原来的主题里面有通过php输出的，这里你先用占位符代替，如果你遇到了RemixIcon图标，vue中从@remixicon/vue导入，你可以参考一下about页面是如何迁移的，这个迁移很成功