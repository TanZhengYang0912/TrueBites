# Dashboard PDF — 正式打印版

## 目标与已确认方向

将 Admin Dashboard 的 Export PDF 改为当前 Dashboard 的正式打印版，而不是另一套摘要报告。
采用已展示的 A4 横向卡片版式：数据、文案、模块顺序和图表类型与网页一致；允许为纸张调整尺寸和分页。
效果图只是布局参考，真实导出必须使用运行时资料，不能硬编码截图中的数字或日期。

## 当前问题

当前导出复用 KPI、分类、来源及 AI pipeline 汇总，但另画表格、圆饼图和垂直柱图。
它缺少 Vendor growth、Needs attention、Recent activity、当前 7/30/90 天区间和数据更新时间。
因此不仅需要调整样式，也需要补齐传入资料和模块，删除 PDF 独有的 Vendor status 圆饼图。

## 数据一致性约定

- 点击 Export PDF 时，固定当前已加载的 Dashboard 数据及当前选择的区间，不额外查询另一批资料。
- 网页与 PDF 共用展示数据模型：标题、副标题、KPI value/suffix/note、区间标签、趋势数据、attention、breakdowns 和 activity rows。
- Vendor growth 使用当前选择的 7/30/90 天切片，保留 New vendors、Active、Draft 三条曲线及相同日期标签。
- KPI 是当前总量，不受仅用于 Vendor growth 的区间选择影响；PDF 也保持这个含义。
- AI pipeline、Categories 和 Source mix 的标签、数值、顺序、颜色及横条相对长度与网页相同；不额外加入网页没有的分类。
- Recent activity 与网页使用相同合并及截取规则：recentVendors 前 4 条和 recentProcessing 前 4 条合并，再取前 6 条；不重新排序或扩大到全量。
- Vendor activity 行使用 Type=Vendor、Item=name、说明=category · location、Status=status；AI activity 行使用 Type=platform、Item=vendor、说明=recommendation、Status=AI imported，不误用 processing.title。
- 数据更新时间使用 Dashboard 的 lastUpdated 和同一格式化函数。生成时间若另行显示，必须标为 Generated，不能冒充 Updated。
- 所有模块的空态、缺失值和显示回退与网页共用规则；无数据不能被画成虚构趋势。
- 当 vendorTrend 为空时，网页与 PDF 统一显示明确的 No data 空态，替代现有网页生成一个零值点的占位方式。真实存在、数值全为零的趋势仍正常绘制。

## PDF 版式

### 第一页

- 头部保留 Operations overview、Good morning, Admin、副文案与 Updated；增加轻量 TrueBites 标识。
- 一排 5 张 KPI 卡：图标、标签、数字和说明，不恢复 sparkline 或省略号。
- 下一排左侧约 2/3 为 Vendor growth，右侧约 1/3 为 Needs attention。
- 展示选中的区间，不把 7/30/90 天控制器伪装为可操作按钮。

### 第二页及溢出页

- 同一排依次放 AI content pipeline、Vendor categories、Source mix，沿用网页 5:4:3 的相对列宽和横向条形样式。
- 下方为 Recent activity，保留 Type、Item、说明和 Status。
- 常规资料目标为两页；内容较长时自动增加续页，不裁切、不省略实际行、不强行缩成难读文字。表格跨页重复表头，长文本换行。

### 通用规则

- A4 横向、统一边距、清晰可读的字体、浅灰背景、白色圆角卡片、与 Dashboard 一致的主色和状态色。
- 页脚包含 TrueBites 和页码。正式 PDF 不含效果图的 LAYOUT PREVIEW 标记。
- 不打印侧栏、Export PDF、Add vendor、Review queue 等操作控件。
- PDF 不是一张长截图：标签、数值和表格文字应可搜索、复制；图表清晰，实际资料字符不能出现乱码。
- 图表的图例、标签、数值和日期轴使用 PDF 文本绘制，不把这些文字烘焙到 PNG；几何线条和色块可使用矢量绘图或高分辨率图片。
- 不承诺跨浏览器与屏幕逐像素一致；验收以内容、顺序、视觉表达和打印可读性为准。

## 实现边界

- 以现有前端 jsPDF 导出基础实现横向打印布局，不为本次需求增加后台浏览器服务或新的部署基础设施。
- 从 Dashboard 抽出小型、纯函数的共享展示数据模型及格式化函数；网页和 PDF 都消费它，避免重复计算和文案漂移。
- 将 Dashboard 专用 PDF 排版与其他列表报表解耦。PDF 绘图函数只负责排版，不获取数据或定义新的统计口径。
- 保留按需加载 PDF 依赖与浏览器预览流程；失败时显示可理解的错误，恢复按钮状态，并清理失败的空白预览窗口及不用的临时资源。
- 本次不改变后台统计口径、数据库、权限体系或 Vendor/Suggestions/Activity 等其他导出功能。
- 不新增 Detailed report、CSV、定时导出或邮件发送。

## 权限与隐私

- 保持现有 Admin 页面权限边界，不增加公开报告接口。
- PDF 仅含当前 Dashboard 展示字段，不输出访问令牌、内部存储路径、原始 API payload 或未展示的敏感字段。
- 不自动持久化导出的管理资料到公共目录或第三方服务。

## 验收标准

1. 用同一测试数据逐项比对网页模型与 PDF：KPI、notes、趋势、attention、三个 breakdown 和 activity 全部一致。
2. 分别验证 7、30、90 天和导出过程中切换区间；已启动的导出仍对应点击时的快照。
3. 验证零值、空数组、缺失字段、长标签、非 ASCII 资料和多页内容；没有 NaN、乱码、裁切或遗漏。
4. PDF 不再出现网页不存在的 Vendor status 圆饼图，KPI 不出现小折线。
5. 将真实生成的 PDF 各页渲染为图片检查布局；同时检查文本提取结果，不能只用效果图证明导出正确。
6. 前端单元测试、production build 和 git diff --check 通过；其他导出功能保持原有行为。
7. 在最终验证前安排 luna_worker 做独立一致性与隐私复核。

## 设计流程状态

- 已完成：现有实现调查、横向版效果图、与用户确认正式打印版方向。
- 本文经自查后提交，等待用户核对书面规格，再进入实现计划及代码阶段。
