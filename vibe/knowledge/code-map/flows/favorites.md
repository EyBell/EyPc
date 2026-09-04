# 05 文件收藏

收藏节点是插件元数据。删除收藏只改图，不删磁盘文件。

## 图与身份

[normalizeFavoriteGraph](../../../../src/domain/favorites.ts#L73) 重建重复 id、把环/孤儿收回根。[favoritePathIdentityKey](../../../../src/domain/favorites.ts#L60) 让 Windows 盘符/UNC 等价，POSIX 保持大小写。

删除：[deleteFavoriteMetadata](../../../../src/domain/favorites.ts#L397)。

## 打开 / 运行

[favoriteLaunch.ts](../../../../src/domain/favoriteLaunch.ts#L1) 规范化运行器、十个平台隔离槽、占位符、信任指纹。Runtime 复核信任后，preload 用 `shell:false` 的 argv 启动。

Quick 模式只搜索打开；管理写操作留在完整页。[QuickFavoritesPage.vue](../../../../src/pages/QuickFavoritesPage.vue#L1) · [FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1)。

## 槽位入口

[featureRouting.ts](../../../../src/runtime/feature/featureRouting.ts#L38) 把 `eypc-favorite-slot-1…10` 映射成 `favorites.slot.activate.N`，`visibilityOwner: 'mainHide'`。失败才打开完整管理页。
