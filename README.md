# Yu Sun 的小博客

原生 HTML、CSS、JavaScript 构建的个人博客，首页与阅读页共用主题和文章数据模块，无需前端构建步骤。

## 前端结构

| 文件 | 职责 |
| --- | --- |
| `index.html` / `read.html` | 页面结构和可访问的浅色／深色切换控件 |
| `css/theme.css` | 共享颜色、字体、阴影，以及 Flex 主题开关和滑块动画 |
| `css/style.css` / `css/read.css` | 首页／阅读页的布局与组件样式 |
| `js/theme.js` | 首屏主题恢复、按钮状态、键盘操作与跨标签页同步 |
| `js/services/posts.js` | 统一文章加载、超时、缓存和并发请求合并 |
| `js/alert.js` / `js/read.js` | 首页交互／文章渲染 |
| `js/discussion.js` | 按需加载 GitHub Discussions 评论、同步主题及处理登录回跳 |

新增页面时，在 `<head>` 中同步加载 `js/theme.js`，并依次引入 `css/theme.css` 和页面样式。主题只存放在 `html[data-theme]` 上，默认浅色；不要给 `body` 再设置主题。开关通过 `data-theme-switch` 和 `data-theme-value="light|dark"` 绑定，支持 Tab、Enter、空格与左右方向键。系统开启“减少动态效果”时会关闭滑动过渡。

文章页面依次用 `defer` 加载 `js/services/posts.js` 和页面脚本，调用 `OmiBlog.posts.load()` 获取 `{ posts, logo? }`。加载顺序为实时 API → 静态 JSON → 本地缓存；每次远程请求最多等待 8 秒。缓存仅在内容变化时写入，避免多个标签页相互触发重复加载。阅读页也优先读取远程数据，避免旧缓存长期遮蔽文章更新。

## GitHub Discussions

首页的「Discussion 讨论」使用 giscus，替换原假 ICP 评论组件。绑定公开仓库 `sunZshanY/personal_website` 的 `General` 分类和现有首页讨论 [#5](https://github.com/sunZshanY/personal_website/discussions/5)，按讨论编号映射，因此域名、`/` 和 `/index.html` 的变化不会拆散留言。

仓库已开启 Discussions 并安装 giscus App。公开的仓库 ID、分类 ID 和讨论编号集中在 `js/discussion.js`，前端不需要 GitHub Token。组件在首次打开面板时加载，跟随站点主题切换；GitHub 登录返回时自动打开讨论面板。网络加载失败时可使用页面上的 GitHub 直达按钮。旧假 ICP 评论不会自动迁移到 GitHub。

## 本地预览

在项目根目录执行 `python -m http.server 8000 --bind 127.0.0.1`，打开 `http://127.0.0.1:8000`。此方式使用静态文章与本地壁纸回退；线上 API 由现有后端提供。

## 浏览器回归验证

首次运行：

```sh
python -m pip install -r requirements-test.txt
python -m playwright install chromium
```

执行 `python -m unittest discover -s tests -v`。测试自动启动临时本地服务器，覆盖滑块中间状态、键盘操作、首屏恢复、跨标签页同步、移动端、减少动画、存储不可用以及文章加载回退；不会请求外部评论或统计服务。
