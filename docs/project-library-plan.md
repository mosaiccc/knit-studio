# 工程与提花库

目标：新建并切换独立工程，保存多个可复用提花，在衣片图解上选择不同花样并精确定位。沿用中文工作台与本地存储，保留旧作品。

设计：工程库保存每个工程的版型、尺寸、密度、提花草稿、放置实例、手绘和标注。共享提花库保存独立命名花样；使用花样时复制快照到工程，不受后续库编辑影响。每个放置实例指定版型、底部起行与右侧起针，并支持移动、复制、翻转、隐藏底色和删除。后加入的花样覆盖先加入者，手绘始终在最上层。

## 实施步骤

- [x] 核心组合：新增 core/placements.js，以右下针行坐标组合多个提花，裁片外裁剪，保留旧版铺满/居中行为。先测试重叠、定位、翻转、透明底色、遮罩及旧数据，再实现。扩展 project.js 校验并复制排列字段。
- [x] 工程仓库：新增 core/workspace.js，纯函数创建/切换/保存工程与提花，兼容旧单工程。先测试隔离、迁移、往返与容量错误，再实现。独立提花文件格式 knit-motif-v1。
- [x] 编辑交互：editor.js 增加选中放置边框与位置拖动回调，保持画笔行为和生命周期。测试拖动不绘画、一次提交、取消恢复。
- [x] 工作台：app.js 接入仓库，工程弹窗、新建工程表单、提花库弹窗、保存/另存花样、导入导出花样、放置与坐标面板。styles.css 保持现有配色与移动端布局。
- [x] 验证：npm test，模块语法；浏览器新建两工程、保存两提花、同时放置、移动、刷新恢复、工程切换、导出备份。保留原工程并清理测试工程。发布原私有站点。

数据约定：project.arrangement 为 legacy/custom，缺省 legacy；project.motifPlacements 为数组，每项包含 id、garmentId、motifId、name、grid、palette、row、stitch、transparentBackground、flipX、flipY。row/stitch 为该花样右下角的针行号。旧 placement 字段继续保留 repeat/center。工程仓库 version:1, activeProjectId, projects:[{id,updatedAt,project}], motifs:[{id,name,grid,palette}]。

验证结果：116 项测试通过；浏览器完成两工程与两提花的保存、定位、拖动、撤销、立即刷新恢复、切换和备份/提花文件导入验证。IndexedDB 保存辅以同步恢复记录，读取异常时阻止覆盖已有工程库。
