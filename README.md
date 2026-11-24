# 数字孪生 Demo

打开页面先看到三张卡片，三个场景都保留：

- **星澜智慧园区**：楼宇、充电、门禁、人流热力。代码在 `src/park/`。
- **澄源工业厂区**：电力 / 水务厂房、地下管网、叉车、三级告警。代码在 `src/plant/`。
- **澜港集装箱码头**：岸桥吊装、集卡路网、箱区调度、作业飞线。代码在 `src/port/`。

两边都是 Vue 3 + TypeScript + SCSS，高德地图 JS API 2.0 的 `GLCustomLayer` 和 Three.js 共用同一块画布。没有后端，数据都是前端 mock。场景里点「返回」回到卡片。

厂区功能如下。园区仍是原来的左侧面板、人流热力和底部状态栏。

## 功能

| 能力 | 在哪 |
| --- | --- |
| 共享 WebGL 上下文，相机每帧同步 | `src/plant/core/MapScene.ts`、`src/utils/coord.ts` |
| GCJ-02 转 Three 局部坐标，固定中心防漂移 | `src/utils/coord.ts` |
| 二维点位和三维对象互点定位 | `MapScene` 的 CircleMarker / Text，配合拾取 |
| 厂房、办公楼、仓库、围墙、道路、绿化、危化区 | `src/plant/core/createWorld.ts` |
| 地上设备与地下管网分层，管网可半透明 | `createWorld.ts` 的 `setPipeGhost` |
| 同类设备 InstancedMesh，远距离简化 | `buildDevices`、`updateLod` |
| 水管 / 电缆流动着色器，告警时流速加快 | `src/shaders/materials.ts` |
| 三级告警：提示、预警、紧急，发光并闪烁 | `src/core/AlarmManager.ts` |
| 告警飞线指向调度办公楼 | `createWorld.ts` 的 `syncAlarmLinks` |
| 叉车沿道路巡线，靠近时减速 | `updateForklifts` |
| 图层开关 | `src/core/LayerManager.ts` |
| 单击拾取、框选 | `src/core/InteractionController.ts` |
| 轨道漫游、第一人称巡检、预设视角、书签 | `CameraController.ts`、`src/core/bookmarks.ts` |
| 测距、测面积、标高、文字标注 | `src/core/MeasureTool.ts` |
| 晴 / 雾 / 雨，昼夜和厂房灯光 | `setWeather`、`setTimeOfDay` |
| 标尺、网格、视角复位 | 底部工具栏 |
| 统计看板（ECharts） | `src/components/ChartBoard.vue` |
| GLB / GLTF 替换白模 | `src/core/ModelLoader.ts` |
| 加载进度和失败说明 | `src/components/LoadingOverlay.vue` |

## 相机为什么能和底图贴在一起

高德底图是 GCJ-02。模型如果误用 WGS-84，会整体偏出一段距离，看起来像在飘。本项目做了两件事：

1. 厂区点位先写成相对中心的米，再换成 GCJ-02，交给高德 `customCoords.lngLatsToCoords`。不要把“米”直接当成 Three 世界坐标去对底图。
2. `setCenter` 始终钉在厂区中心。渲染时只调用 `customCoords.getCameraParams()`，按官方顺序写回 Three 透视相机的 near、far、fov、position、up、lookAt。模型坐标初始化时算一次，之后不再跟着 `map.getCenter()` 改。

坐标系约定和官方示例一致：X 东、Y 北、Z 上。`renderer.autoClear = false`，否则会把底图清掉。动画要主动 `map.render()`，地图静止时不会自己重绘，管线流动和告警闪烁会停住。

厂区布局是虚构的，锚点放在北京经开区附近的真实 GCJ-02 坐标上，用来演示和路网贴合，不是测绘数据。

## 安装和启动

需要 Node.js 18。样式使用 Sass 1.77.8，这个版本能在 Node 18 上编译；不要升到需要 Node 20 的 Sass 1.100 以上。Three.js 锁定 0.162.0，因为高德自定义图层给出的是 WebGL 1，r163 起不再支持。

```bash
cd Digital-Twin
npm install
```

复制环境变量文件并填入自己的 Key：

```bash
# Windows cmd
copy .env.example .env

# Git Bash / macOS / Linux
cp .env.example .env
```

`.env`：

```bash
VITE_AMAP_KEY=你的Web端JSAPIKey
VITE_AMAP_SECURITY_JS_CODE=你的安全密钥
```

Key 不要写进源码，也不要提交 `.env`。安全密钥要在加载高德脚本之前挂到 `window._AMapSecurityConfig`，这件事在 `src/main.ts` 里完成。

然后：

```bash
npm run dev
```

浏览器打开终端里给出的地址，默认是 `http://localhost:5180`。5180 被占用时 Vite 会改用下一个端口。

类型检查和生产构建：

```bash
npm run typecheck
npm run build
npm run preview
```

## 高德 Key

1. 打开 [高德开放平台控制台](https://console.amap.com/dev/key/app) 并登录。
2. 创建应用，添加 Key，服务平台选择 **Web端(JS API)**。
3. 记下 Key，以及 Key 旁边的 **安全密钥**。
4. 域名白名单可以留空。如果要填，只写域名本身，例如 `localhost`，不要带 `http://`、端口或结尾的 `/`。
5. 写入 `.env` 后重启 `npm run dev`。改环境变量不会热更新。

## 目录和模块

```text
src
├─ App.vue                         三张卡片，选中后进入对应场景
├─ home/HomeGate.vue               入口
├─ park/                           星澜智慧园区
├─ plant/                          澄源工业厂区
├─ port/                           澜港集装箱码头
├─ core/                           场景共用的相机和模型加载
└─ utils/coord.ts                  GCJ-02 与局部坐标
```

## 澜港集装箱码头

锚点在外高桥附近的 GCJ-02 上，箱区和岸桥是虚构布局。坐标仍走 `src/utils/coord.ts`：业务点用米，先换成 GCJ-02，再经 `customCoords.lngLatsToCoords` 进入 Three。`setCenter` 钉在码头中心，渲染时只同步相机，所以旋转、倾斜、缩放时模型贴地不漂。

| 能力 | 在哪 |
| --- | --- |
| 共享 WebGL，相机每帧同步 | `src/port/core/MapScene.ts` |
| 岸桥大车、吊具、吊箱绑定 | `src/port/core/CraneAnimator.ts` |
| 集卡路网、到点停车、倍速 | `src/port/core/TruckSimulator.ts` |
| 装船调度和作业日志 | `src/port/core/DispatchSimulator.ts` |
| 岸桥 / 箱 / 集卡 / 标线 / 告警图层 | `src/port/core/LayerManager.ts` |
| 飞线、轨迹渐隐、拥堵色带、视锥裁剪 | `src/port/core/effects.ts` |
| 测距、区域、文字 | `src/port/core/MeasureTool.ts` |
| 三级告警发光 | `src/port/core/AlarmManager.ts`、`src/port/shaders/materials.ts` |
| 集装箱、监控、地磅实例化，岸桥可换 GLTF | `createWorld.ts`、`src/core/ModelLoader.ts` |

页面是 16:9 指挥舱：顶栏、左侧看板、右侧三维、底部工具栏。点击地图圆点会飞到三维对象，点击三维对象会加粗对应圆点。底部可以播放、暂停、重置和 0.5x 到 3x。快捷键：`1` 总览，`2` 泊位，`3` 堆场，`4` 闸口，`0` 复位，`N` 昼夜，`B` 框选，空格暂停，`Esc` 退出。

控制台可以调：

```js
__port.flyPreset('berth')
__port.setTimeOfDay('night')
__port.setSpeed(2)
__port.setLayer('flow', false)
```

箱色：空箱 `#8aa4b8`，重箱 `#e07a3d`，待提箱 `#4aa3ff`，待装船 `#3dbe8c`。车道绿畅通、黄缓行、红拥堵。告警提示 `#4aa3ff`、预警 `#f0b429`、紧急 `#ff5a62`。

## 操作

- 左键拖拽平移，右键旋转，滚轮缩放，Ctrl + 左键或右键调整俯仰。测量模式下会暂时关掉旋转。
- 点击厂房、设备、管线、出入口，或点击地图上的圆点和名称，另一侧会高亮并飞过去。
- 告警列表可按等级和设备类型筛选。点击一条会飞到对应设备。
- 框选：打开「框选」后拖矩形。设备层关闭时不会选中。
- 文字标注：先切到「文字」，在底部输入内容，再单击地图放置。测量结果留在「测量标注」图层里。
- 第一人称：WASD 移动，鼠标转向，Shift 加速，滚轮缩放，Esc 退出。镜头仍然由高德控制。
- 晴、雾、雨会改光照和底图。夜晚点亮生产、水务、电力和危化车间的窗户，以及在线路灯。
- 书签保存在本机 `localStorage`。替换模型要先点选一座厂房，再在「图层」里选择 `.glb`。

快捷键：`1` 总览，`2` 车间，`3` 危化区，`4` 出入口，`0` 或 `R` 复位，`B` 框选，`N` 昼夜，`Esc` 逐级退出。

浏览器控制台里可以直接调：

```js
__park.flyPreset('workshop')
__park.setTimeOfDay('night')
__park.setWeather('rain')
__park.setLayer('pipe', true)
__park.clearAlarms()
```

## 数据说明

设备大约每 2.6 秒抖动一次遥测。温度、压力、湿度超过阈值后进入提示、预警或紧急，取三者里最重的一级。离线设备不进告警列表。

- 正常 `#3dbe8c`
- 提示 `#4aa3ff`
- 预警 `#f0b429`
- 紧急 `#ff5a62`，发光并更快闪烁
- 离线 `#64748b`

「清除告警」把遥测压回阈值以下，离线不动。「重置设备」会全部恢复在线且正常。告警变多时管线流速会加快。叉车速度用底部滑杆调节，两车距离小于 8 米时会减速。

## 常见问题

**底图空白，三维也没有。**  
Key、安全密钥、域名白名单三者要一致，改完 `.env` 要重启开发服务器。

**只有底图，没有白模。**  
打开控制台看着色器或 WebGL 报错。不要把 Three.js 升过 0.162.0。

**模型和路网错开一大块。**  
检查是不是又把 WGS-84 点塞进来了，或者在渲染循环里对 `customCoords.setCenter` 用了当前地图中心。

**管线不动、告警不闪。**  
`map.render()` 没有在动画循环里调用。地图不交互时不会自己刷新自定义图层。

**点了管线没反应。**  
管网层被关掉了。管线画在道路下方，道路材质不写深度，所以可以直接点到。打开「管网透视」可以单独看地下管线。

**第一人称没有鼠标锁定。**  
浏览器可能拦截了指针锁定。按住左键拖动同样可以转向，页面会给出提示。
