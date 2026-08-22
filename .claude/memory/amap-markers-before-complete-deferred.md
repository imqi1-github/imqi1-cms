---
name: amap-markers-before-complete-deferred
description: AMap 2.0 在 map complete 前创建的 marker/聚合会被推迟到首个渲染周期才画，导致「底图先出、点后冒出」；建 marker 须放 complete 回调内
metadata: 
  node_type: memory
  type: project
  originSessionId: 0f1a4793-4bde-40e2-bb65-269b2512ef0a
---

AMap 2.0 的 marker/聚合（MarkerClusterer）图层挂在底图渲染管线里：在 `map.on("complete")` 触发**之前** `new AMap.Marker` 或 `new MarkerClusterer`，marker 不会随底图一起画出，而是被推迟到地图首个渲染周期后才渲染。表现就是地图先加载完、遮罩撤掉时地图上啥也没有，随后点「突然出现」。

**Why:** 加载遮罩（loading ref）在 `complete` 时撤掉，而集群/标记是在 onMounted 里提前建的——两个时机错开。

**How to apply:** 初次建 marker/聚合必须放进 `complete` 回调里，且与撤遮罩同帧完成：`complete` 回调内「先 fit 视野 → 再 createCluster/buildMarkers → 最后 loading=false」，让点与底图同一渲染周期画出、一起出现。兜底 setTimeout 与 complete 都走同一个幂等 init 函数（`initialRenderDone` 守卫 + 取消兜底 timer），避免 complete 未触发时地图空转无点。2026-08-22 已修 `app/components/TravelMap.vue` 与 `app/components/admin/TravelCoordinatePicker.vue`（后者同样把 ensureMarker 挪进 complete）。相关 AMap 行为见 [[travelmap-maxzoom-sync-createcluster]]。

**相邻坑：tab 切换点消失。** map 三视图数据懒加载，切到未加载过的 tab 时 places 会先变空数组 → TravelMap 的 places watch 销毁旧聚合 → 地图瞬间无点、数据到了再重建（点「消失再跳变」）。修法（map.vue）：加 `lastNonEmptyPlaces = shallowRef(...)` + watch 记录最近一次非空点集，`places` computed 在 `pending && currentPlaces.length===0` 时返回 `lastNonEmptyPlaces.value`——**引用不变 → TravelMap 的 `() => props.places` watch（默认按引用比较）不触发、旧聚合不销毁**；数据到位后整体替换。

**状态提示收敛（2026-08-22）：/map 全页不再用任何居中遮罩。** map.vue 右下角一行小字（`right-2 z-20` + `bottom:${footerH+4}px`，`pointer-events-none`，内部可点项 `pointer-events-auto`）统一承载所有状态：`statusText` computed 按优先级返回「加载中… / 地图加载中… / 各视图统计 / 空态」；数据 fetch 失败显示可点的「加载失败，点击重试」按钮（`retryCurrentView`，点 tab 已激活视图不会重发，必须靠它）。TravelMap 自身不再自绘「地图加载中…/地图加载失败」遮罩，改为 `defineEmits` 两个事件 `loading-change`/`error-change`（`watch(loading, ...) { immediate: true }` 上报），map.vue 收进 `mapLoading`/`mapLoadError` ref。注意：script 里读 computed 必须 `.value`（`travelProvinceStats.value.places`），模板里才可省略。
