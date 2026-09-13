# 🏁 Voxel Grand Prix · 体素大奖赛

[English](README.md) | **简体中文**

[![Deploy to GitHub Pages](https://github.com/TaoweNlin/voxel-grand-prix/actions/workflows/deploy.yml/badge.svg)](https://github.com/TaoweNlin/voxel-grand-prix/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r166-049EF4)](https://threejs.org)

纯浏览器运行的体素风格 F1 赛车游戏。**六条赛道**均基于**真实 GPS 中心线数据**复刻——
弯道序列、赛道长度（误差 < 0.4%）与海拔起伏和现实一致。全程零素材：
每一辆赛车、每一座看台、每一声引擎轰鸣都由代码生成。

### ▶️ [立即游玩](https://taowenlin.github.io/voxel-grand-prix/)

| | |
|---|---|
| ![新加坡夜赛](docs/screenshots/singapore-night.jpg) | ![斯帕 Raidillon](docs/screenshots/spa-raidillon.jpg) |
| 滨海湾夜赛 — 泛光灯与天际线 | 斯帕 — 冲上 Eau Rouge / Raidillon |
| ![摩纳哥 赌场广场](docs/screenshots/monaco-casino.jpg) | ![铃鹿 8字立体交叉](docs/screenshots/suzuka-crossover.jpg) |
| 摩纳哥 — RB18 冲上赌场广场坡顶 | 铃鹿 — F1-75 穿越 8 字立体交叉 |
| ![隧道内车载视角](docs/screenshots/cockpit-tunnel.jpg) | ![蒙扎 抛物线弯](docs/screenshots/monza-parabolica.jpg) |
| 车载 T-Cam · 摩纳哥隧道 | 蒙扎 — 黄昏冲进 Parabolica |

## 车库 Garage

![车库展厅](docs/screenshots/garage-showroom.jpg)

**2022 赛季十支车队全员到齐**，全部采用 **SDF 隐式曲面雕刻**（在 1.6cm
体素网格上采样数学曲面，而非方块堆叠），带逐顶点环境光遮蔽、漆面碎钻闪光、
像素字体贴花，且各自还原车队的空气动力学哲学：

| 赛车 | 车号 | 标志性车身 |
|---|---|---|
| 🔵 **红牛 RB18** | 1 | 下洗式侧箱，冲锋公牛 + 朝阳贴花 |
| 🔴 **法拉利 F1-75** | 16 | 「浴缸式」侧箱进气槽，跃马剪影 |
| ⚪ **梅赛德斯 W13** | 44 | 激进零侧箱概念，青色地板边缘，三叉星徽 |
| 🟠 **迈凯伦 MCL36** | 4 | 深度下切侧箱，速度标 Swoosh |
| 🔷 **Alpine A522** | 14 | 法国蓝 × BWT 粉色飞线 |
| 🟢 **阿斯顿·马丁 AMR22** | 5 | 英国赛车绿的「绿色红牛」B 版 |
| 💙 **威廉姆斯 FW44** | 23 | 平板式宽侧箱，电光蓝 |
| 🍷 **阿尔法·罗密欧 C42** | 77 | 酒红车尾流向纯白鼻锥 |
| 🌑 **AlphaTauri AT03** | 10 | 深蓝底 + 利落白色勾线 |
| ⬜ **哈斯 VF-22** | 20 | 纯白车身配红蓝星条饰线 |

车库是一个带地板倒影的摄影棚转台：拖拽旋转、滚轮缩放、DRS 自动开合演示——
选定的赛车会保存下来，用于之后的每一场比赛。

## 赛道

| 赛道 | 长度 | 标志性看点 |
|---|---|---|
| 🇲🇨 **摩纳哥** Circuit de Monaco | 3.325 km | 全程街道护墙、爬升 30 米的赌场广场、19 米半径费尔蒙发夹弯、海滨隧道、游艇码头 |
| 🇬🇧 **银石** Silverstone | 5.879 km | Maggotts–Becketts 高速连续弯、Hangar 直道 307 km/h、砂石缓冲区、巨型看台 |
| 🇯🇵 **铃鹿** Suzuka | 5.814 km | 全球唯一 8 字形 F1 赛道——先从桥**下**穿过，半圈后再从桥**上**跨越；S 字弯、130R、摩天轮 |
| 🇧🇪 **斯帕** Spa-Francorchamps | 6.978 km | La Source、40 米落差的 Eau Rouge/Raidillon、Kemmel 直道、双左 Pouhon——阿登天空下穿越针叶林海 |
| 🇮🇹 **蒙扎** Monza | 5.787 km | 黄昏时分的速度圣殿：Rettifilo、双 Lesmo、Ascari 与 Parabolica，秋色皇家园林（附飞艇） |
| 🇸🇬 **滨海湾** Marina Bay | 4.944 km | F1 首个夜赛、逆时针街道：泛光灯塔灯光池、点亮的摩天楼天际线、辉光霓虹 |

## 特性

- **SDF 雕刻体素赛车**（车库约 35 万体素 / 17.7 万面片，比赛自动降 LOD）：
  级联前翼、Halo、胶囊悬挂、车手头盔、刹车导管、扩散器隔板、刹车雨灯，
  以及**真正会开合的 DRS 尾翼**
- **有真实感的操控**：双轴自行车模型、空气下压力（高速弯贴地、发夹弯灵活）、
  后轮摩擦圆牵引（大脚油门可控滑动 + 白烟 + 胎痕）、速度敏感转向、坡道重力、
  路缘/草地/砂石抓地差异、护墙碰撞——0-100 km/h 2.9 秒，DRS 极速 320+，制动 2.8g
- **四种视角**（`C` 键）：第三人称追尾、第一人称座舱（透过 Halo 看赛道）、经典 T-Cam、转播 TV 机位
- **正赛模式——浓缩版真实大奖赛**：十支车队全员发车、五灯站立式起步
  （起步阶段保持发车格车道纪律，不再一窝蜂挤向同一条线）、3 圈决胜、
  实时排名与前后差距，冲线后有完整赛果结算
- **像真车手一样比赛的 AI**：每辆车沿**最小曲率赛车线**（外-内-外，
  K1999 式曲率均衡算法）全速行驶并配有专属速度剖面；车流中按时距跟车，
  超车时承诺一侧果断完成并保持动量，绝不转向已被占用的空位，
  被挤到赛道边缘时主动退出三宽——真正卡死时才有"救援吊车"
- **完整比赛氛围**：五灯起步、检查点计圈、最速圈本地存档、弯道名实时播报、
  DRS 区域、逆行警告、全场赛车队色圆点实时显示的小地图、演示模式自动驾驶（`P`）
- **转播观战视角**：沿赛道每约 270 米一座 TV 机位（弯道内侧高塔，高过树冠；
  种树时自动避开每座机位的视线走廊，镜头永不被场景遮挡），
  定点摇摄 + 长焦变焦 + 自动交接——演示模式自动切入，也可用 `C` 键切换
- **100% 程序化音频**（WebAudio）：随转速变化的引擎声浪、风噪、轮胎尖啸、
  路缘震动、换挡声
- **物理启发的光照**：大气散射天空（每站独立浊度/瑞利参数），并 PMREM 烘焙为
  场景的影像照明；4K 阴影贴图、每站独立太阳角度——阿登阴天、蒙扎黄昏，
  以及新加坡完整**夜赛管线**（星空穹顶、泛光灯灯光池、亮窗天际线、辉光后处理）
- **鲜活的场外世界**：沿赛道走廊压平的程序化地形起伏、3200 棵针叶林海、
  秋色园林、夜景天际线、轮胎墙、防护网、巡游飞艇等
- **性能优秀**：约 70 个 draw call，单帧渲染远低于 2ms

## 操作

| 按键 | 功能 |
|---|---|
| `W` / `↑` | 油门 |
| `S` / `↓` | 刹车 |
| `A` `D` / `←` `→` | 转向 |
| `C` | 切换视角（追尾 → 座舱 → T-Cam → TV 观战） |
| `R` | 重置回赛道（本圈作废） |
| `P` | 演示模式（自动驾驶） |
| `M` | 静音 |
| `Esc` | 暂停 |
| 🎮 | 支持手柄（左摇杆转向 + 扳机油门/刹车） |

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物输出到 dist/
```

## 赛道是怎么复刻的

1. `raw/*.geojson` — 来自 [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)
   的真实赛道中心线（MIT 协议）
2. `npm run data:convert` — 将经纬度投影为本地米制坐标（`src/data/circuits.js`）
3. `npm run data:plot` — 生成带曲率峰值表的标定图，用于确定起点线位置、
   行驶方向和每个弯道的里程占比（存入 `src/config.js`，配合手工调校的海拔剖面）
4. `src/track.js` 以 2.5m 步长重采样中心线，按曲率自动铺设路缘石、
   生成护墙/缓冲区、检测铃鹿 8 字交叉点，并预计算中心线速度剖面与
   AI 车手使用的最小曲率赛车线

## 项目结构

```
src/
  main.js         主循环、菜单、视觉同步
  config.js       赛道配置（弯道、海拔、DRS…）
  carSculpt.js    SDF 雕刻引擎：部件、贴花、AO 网格化
  teams.js        十支车队定义（调色板、外形参数、贴花）
  garage.js       车库展厅、转台、选车
  voxel.js        方块体素构建器（环境道具）
  physics.js      车辆动力学
  track.js        路面/路缘/护墙几何、计时采样、空间查询
  environment.js  天空、阳光、观众、建筑、隧道、立交桥、摩天轮
  cameras.js      追尾 / 座舱 / T-Cam / 转播 TV 机位
  race.js         起步灯序、计圈、AI 车手大脑、车际碰撞
  hud.js          F1 风格 HUD + 小地图
  audio.js        程序化引擎/风噪/轮胎音效
  particles.js    烟雾 + 轮胎痕迹
  input.js        键盘 + 手柄
tools/            数据转换与标定工具
raw/              GeoJSON 源数据（MIT，bacinger/f1-circuits）
```

## 致谢

- 赛道几何数据：[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)（MIT）
- 基于 [Three.js](https://threejs.org) 与 [Vite](https://vitejs.dev) 构建

## 许可证

[MIT](LICENSE)
