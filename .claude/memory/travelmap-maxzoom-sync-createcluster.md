---
name: travelmap-maxzoom-sync-createcluster
description: "TravelMap map 初始化 zooms 上限必须固定 20——高德底图 POI 图层按初始 zooms 上限锁定,运行时 setZooms 放开无效;9 级封顶改由 createCluster 内运行时 setZooms 实现"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a9ab936-5454-4fab-9f6d-5e6b1aee64b2
---

TravelMap.vue(/map 三视图共用一个实例:我的足迹 travels / 访客分布 footprint / 博客网络 blogs,view 切换只改 props.places 与 props.maxZoom,不重建 map)。

**map 初始化 zooms 上限必须固定 20**:`onMounted` 里 `new AMap.Map("travel-map", { zooms: [props.minZoom ?? MIN_ZOOM_DEFAULT, 20] })`,**绝不能**写 `props.maxZoom ?? 20`。

**Why:** 高德底图 POI 标注图层(公园/建筑/街道/机构名等浅色文字)的可见级别在**地图初始化时**按 zooms 上限锁定,运行时 `setZooms` 放开**无法**让 POI 图层恢复。map.vue 给 footprint/blogs 传 `:max-zoom="9"`(FOOTPRINT_MAX_ZOOM=9,城市级封顶),travels 传 undefined。若初始化用 `props.maxZoom ?? 20`:从访客分布进入时 zooms=[4,9] → POI 图层锁定到 9 → 切到「我的足迹」即便 setZooms([4,20]) 放开,放大到街道级(zoom 16)底图也不显示任何公园/建筑/街道名(2026-08-09 报的 bug,几十个 POI 文字全消失,只剩大头针)。改固定 20 后,任何视图进入 POI 图层都配到 20。实测 setZooms 运行时收窄到 [4,9] **不影响** POI 图层(只要初始化上限够大)——所以 footprint/blogs 的 9 级封顶可安全交给运行时 setZooms。验证:footprint 进入→切 travels→zoom16 底图 POI 丰富(天津大剧院/博物馆/万象城等几十个),与直接 travels 进入 zoom16 的 POI 99% 一致。

**How to apply:**
- 改 map 初始化 zooms:上限固定 20(或所需最大街道级),**别**用 props.maxZoom 收窄。
- footprint/blogs 的 maxZoom 封顶放 `createCluster()` 里 MarkerClusterer 创建前:`map.setZooms([props.minZoom ?? MIN_ZOOM_DEFAULT, effectiveMax])`(effectiveMax=props.maxZoom ?? 20),与 `maxZoom: effectiveMax` 同源。**别**放独立 `watch(()=>[minZoom,maxZoom])` 提前 setZooms——切视图时 places 懒加载先变空(useFetch `immediate: view===当前`)→ 旧 cluster setMap(null) 销毁、map 上无点,若 watch 此时立即 setZooms([4,20]) 会出现「map 无点却允许放大到街道级」的窗口(放大后空荡)。createCluster 绑定后:places 空期间维持上次有效区间(如 [4,9]),有数据建聚合时才放开。maxZoom watch 只保留越界钳制(z<lo→setZoom、z>hi→fitChinaView)。
- effectiveMax 必须与 map 实际上限对齐:曾写死 18 而 map 上限 20 → 19~20 级聚合被关闭,同坐标点(同城质心/同服务器多 blog)退化成像素重叠单标记,点击只命中顶层、合并清单丢失。
- 调试 map 实例:`document.getElementById('travel-map').amap` 即 AMap.Map 实例(有 getZooms/getZoom/setZoomAndCenter),组件未 defineExpose 时用这条拿实例验证 zooms/放大。相关:[[prisma-relation-key-rename-trap]](改 travels API 后必 curl)。
