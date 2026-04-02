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