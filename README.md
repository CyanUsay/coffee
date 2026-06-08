# ☕ Café Journal

和瑶一起用的咖啡日志小工具——记录去过的咖啡店、喝过的咖啡、打分、写笔记。

## 本地运行

```bash
cd cafe-journal
npm install
npm run dev
```

然后浏览器打开终端里显示的地址（默认 http://localhost:5173 ）。

手机上用的话：用 `npm run dev -- --host`，然后用手机访问电脑的局域网 IP。

## 打包部署

```bash
npm run build      # 产物在 dist/
npm run preview    # 本地预览打包结果
```

部署到 Vercel：把这个目录作为项目根，框架选 Vite，零配置即可。

## 功能

- 双用户（Cyan / 瑶）各自记录、互相可见
- 多维评分：综合口味 / 环境 / 性价比（5 分）+ 香醇度 / 风味度（5 分）+ 再访意愿（3 档）
- 照片（自动压缩到 480px）、地铁站、笔记
- 「再喝一次」快速复记同店、同店历史、搜索、筛选、编辑删除

## 数据存储 —— 当前阶段

现在数据存在**浏览器本地（localStorage）**：单设备、零后端、马上能用，但**换浏览器/换设备看不到对方的记录**。

存储逻辑全部隔离在 `src/storage.js`，只有三个函数（get/set/delete）。

### 下一步：和瑶共享（接 Supabase）

要实现两个人跨设备共享同一本日志，只需把 `src/storage.js` 里的三个函数换成
Supabase 实现，`CafeJournal.jsx` 一行都不用动。需要：

1. 注册 Supabase（免费），建一个 `entries` 表
2. 填入项目 URL 和 anon key
3. 重写 storage.js 的 get/set/delete 走 Supabase

到时候我陪你一步步弄。

## 目录结构

```
cafe-journal/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx          # 入口
    ├── CafeJournal.jsx   # 全部 UI 和交互（来自原型）
    └── storage.js        # 存储层（localStorage，可换 Supabase）
```
