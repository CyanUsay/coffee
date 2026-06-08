# 把这个项目搬进 coffee 仓库 + 开启自动部署

目标：让 `coffee` 仓库装上完整源码，每次 push 自动构建发布到 GitHub Pages，
干净网址 `https://cyanusay.github.io/coffee/`，以后改代码一推就更新。

## 给"能操作 coffee 仓库的会话"的指令

把本目录（`cafe-journal/`）下的**全部内容**（含隐藏的 `.github/` 文件夹）
复制到 `coffee` 仓库的**根目录**，结构变成：

```
coffee/
├── .github/workflows/deploy.yml   # 自动部署
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── CafeJournal.jsx
│   └── storage.js
└── README.md
```

注意：
- `coffee` 根目录里原来那个手动上传的 `coffee-app-index.html` 和旧 `index.html`
  可以删掉，由自动构建产物取代。
- 不要带上 `node_modules/`、`dist/`、`*.zip`（`.gitignore` 已忽略）。

## 仓库一次性设置（在 GitHub 网页）

1. `coffee` 仓库 → **Settings → Pages**
2. **Build and deployment → Source** 选 **GitHub Actions**（不是 Deploy from a branch）

之后每次 push 到 `main`，Actions 自动构建并发布，几十秒后网址刷新即新版。

## 关于单文件 vs 多文件

当前 `vite.config.js` 用 `vite-plugin-singlefile`，构建产物是单个自包含
`dist/index.html`，所以网址在子路径 `/coffee/` 下也不会有资源 404 问题，
无需配置 `base`。保持现状即可。
