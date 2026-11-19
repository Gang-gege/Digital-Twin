# 星澜智慧园区 · 数字孪生 Demo

一个用于学习 WebGL GIS 的前端演示：高德地图 JS API 2.0 的 `GLCustomLayer` 和 Three.js 共用同一块画布，底图和园区白模同步缩放、旋转、倾斜。没有后端，设备、告警、人流都是前端 mock。

适合作为简历里的可视化项目。界面是深色指挥舱布局：左侧控制、右侧场景、底部状态。

## 功能

| 能力 | 在哪 |
| --- | --- |
| 共享 WebGL 上下文，相机每帧同步 | `src/core/MapScene.js`、`src/utils/coord.js` |
| GCJ-02 转 Three 局部坐标，固定中心防漂移 | `src/utils/coord.js` |
| 二维点位和三维对象互点定位 | `MapScene` 里的 CircleMarker / Text，配合拾取 |
| 建筑白模、楼层线、道路、绿化、出入口 | `src/core/createWorld.js` |
| 建筑 LOD，拉远后退化成盒子 | `createWorld.js` 的 `LOD_DISTANCE` |
| 设备 InstancedMesh | `createWorld.js` `buildDevices` |
| 地下管网 + GLSL 流动 | `src/shaders/materials.js` |
| 告警发光、闪烁 | 告警球壳着色器 + 实例颜色脉冲 |
| 图层开关：建筑 / 设备 / 管网 / 告警，以及飞线、热力、标注 | `src/core/LayerManager.js` |
| 单击拾取、框选 | `src/core/InteractionController.js` |
| 自由漫游、第一人称、预设视角、环视、复位 | `src/core/CameraController.js` |
| 测距、测面积、标高，标注独立图层 | `src/core/MeasureTool.js` |
| 告警列表、统计、清除、重置 | `src/core/AlarmManager.js` |
| 飞线、人流热力、昼夜和路灯 | `createWorld.js`、`MapScene.setTimeOfDay` |
| GLB / GLTF 替换白模 | `src/core/ModelLoader.js` |
| 加载动画、完成提示、错误说明 | `src/components/LoadingOverlay.vue` |

## 相机为什么能和底图贴在一起

高德底图是 GCJ-02。模型如果误用 WGS-84，会整体偏出一段距离，看起来像在飘。本项目做了两件事：

1. 园区点位先写成相对中心的米，再换成 GCJ-02，交给高德 `customCoords.lngLatsToCoords`。不要把“米”直接当成 Three 世界坐标去对底图。
2. `setCenter` 始终钉在园区中心。渲染时只调用 `customCoords.getCameraParams()`，按官方顺序写回 Three 透视相机的 near、far、fov、position、up、lookAt。模型坐标初始化时算一次，之后不再跟着 `map.getCenter()` 改。

坐标系约定和官方示例一致：X 东、Y 北、Z 上。`renderer.autoClear = false`，否则会把底图清掉。动画要主动 `map.render()`，地图静止时不会自己重绘，管线流动和告警闪烁会停住。

园区布局是虚构的，锚点放在北京经开区附近的真实 GCJ-02 坐标上，用来演示和路网贴合，不是测绘数据。

## 安装和启动

需要 Node.js 18 或更高版本。

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

Key 不要写进源码，也不要提交 `.env`。安全密钥要在加载高德脚本之前挂到 `window._AMapSecurityConfig`，这件事在 `src/main.js` 里完成。

然后：

```bash
npm run dev
```

浏览器打开终端里给出的地址，默认是 `http://localhost:5180`。

高德控制台里这个 Key 要选「Web端(JS API)」，并把 `localhost` 和 `127.0.0.1` 配进域名白名单。没配 Key 时，页面会停在说明卡上，不会白屏崩溃。

生产构建：

```bash
npm run build
npm run preview
```

## 高德 Key

1. 打开 [高德开放平台控制台](https://console.amap.com/dev/key/app) 并登录。
2. 创建应用，添加 Key，服务平台选择 **Web端(JS API)**。
3. 记下 Key，以及 Key 旁边的 **安全密钥**。
4. 域名白名单至少包含 `localhost`、`127.0.0.1`。上线后再加正式域名。
5. 写入 `.env` 后重启 `npm run dev`。改环境变量不会热更新。

## 目录和模块

```text
src
├─ main.js                         安全密钥、Vue 入口、全局错误
├─ App.vue                         布局：左面板、场景、状态栏、加载层
├─ components
│  ├─ ControlPanel.vue             统计、图层、工具、告警列表
│  ├─ InfoPanel.vue                拾取信息
│  ├─ StatusBar.vue                坐标、姿态、LOD、时间
│  └─ LoadingOverlay.vue           加载动画和失败说明
├─ core
│  ├─ MapScene.js                  地图、GLCustomLayer、总调度
│  ├─ createWorld.js               白模、设备、管网、飞线、光照
│  ├─ LayerManager.js              图层显隐
│  ├─ AlarmManager.js              告警定时模拟
│  ├─ InteractionController.js     拾取和框选
│  ├─ MeasureTool.js               测量标注（独立覆盖物组）
│  ├─ CameraController.js          飞行、环视、第一人称
│  └─ ModelLoader.js               GLTF/GLB 适配到建筑占地
├─ shaders/materials.js            管线流动、飞线、告警发光
├─ mock/parkData.js                全部模拟数据
└─ utils
   ├─ coord.js                     GCJ-02 与局部坐标
   ├─ render.js                    几何体、道路带、窗户、释放资源
   └─ present.js                   信息面板字段
```

每个核心文件顶部都有注释，说明这个类负责什么、和地图相机的关系是什么。

## 操作

- 左键拖拽平移，右键旋转，滚轮缩放，Ctrl + 左键或右键调整俯仰（测量模式下会暂时关掉旋转，避免右键结束测量时把地图转走）。
- 点击建筑、设备、管线、出入口，或点击地图上的圆点和名称，另一侧会高亮并飞过去。
- 告警列表可以按预警 / 告警筛选，点击一条会飞到对应设备。
- 框选：打开「框选设备」后拖矩形。设备层关闭时不会选中。
- 测量结果留在「测量标注」图层里，可以单独隐藏或一键清除。标高会优先取被点中的建筑高度或设备安装高度，点空地则是 0。
- 第一人称：WASD 移动，鼠标转向，Shift 加速，滚轮缩放，Esc 退出。镜头仍然由高德控制，所以底图不会和模型脱开。
- 自动环视会在你按住地图时暂停。
- 夜晚会切换深色底图、压低环境光，在线路灯灯头变暖色。
- 替换模型：先点选一座建筑，再点「替换选中建筑」，或把 `.glb` 拖进场景。模型按 Y 轴向上处理，会缩放到该建筑的占地和高度。`恢复白模` 可以退回。

快捷键：`1` 全局，`2` 研发中心 A 座，`3` 南门，`0` 或 `R` 复位，`B` 框选，`N` 昼夜，`Esc` 逐级退出。

浏览器控制台里可以直接调：

```js
__park.flyPreset('gate')
__park.setTimeOfDay('night')
__park.setLayer('pipe', false)
__park.clearAlarms()
```

## 替换真实模型

白模是默认表现。接口在 `ModelLoader.loadFitted(url, { w, d, h })`：

- `w` / `d` 是占地的东向、北向尺寸（米）
- `h` 是高度（米）
- 返回的组已经绕 X 轴转了 90°，适配 Z 轴向上的场景

优先使用单文件 `.glb`。带外部贴图的 `.gltf` 从本地选择时，浏览器读不到旁边的 bin 和图片。

## 数据说明

设备大约每 2.6 秒抖动一次遥测，并随机产生、升级或恢复告警。同时最多大约 8 条活动告警。颜色约定：

- 正常绿色
- 预警黄色
- 告警红色，发光并更快闪烁
- 离线灰色，不进告警列表

「清除告警」只把预警和告警打回正常，离线不动。「重置设备」会全部恢复在线且正常。

人流热力是锚点周围的模拟散点，打开图层后数值会缓慢起伏。飞线从南门、东门、西门连到研发中心、数据中心、充电桩和生产厂房门禁。

## 常见问题

**底图空白，三维也没有。**  
Key、安全密钥、域名白名单三者要一致，改完 `.env` 要重启开发服务器。

**只有底图，没有白模。**  
打开控制台看着色器或 WebGL 报错。高德自定义图层给出的是 WebGL 1 上下文，Three.js 从 r163 起不再支持，所以本项目锁定 `three@0.162.0`。不要自行升到更新版本。

**模型和路网错开一大块。**  
检查是不是又把 WGS-84 点塞进来了，或者在渲染循环里对 `customCoords.setCenter` 用了当前地图中心。

**管线不动、告警不闪。**  
`map.render()` 没有在动画循环里调用。地图不交互时不会自己刷新自定义图层。

**点了管线没反应。**  
管网层被关掉了。管线画在道路下方，道路材质不写深度，所以可以直接点到。

**第一人称没有鼠标锁定。**  
浏览器可能拦截了指针锁定。按住左键拖动同样可以转向，页面会给出提示。
