# UNO CLUB

三个独立页面：`/` 经典 UNO、`/flip` UNO FLIP、`/flex` UNO FLEX。

## 使用

- 在线：输入昵称创建房间，把邀请链接给另外三位玩家。四人点准备，房主开局。房间保留24小时，同一浏览器标签页刷新后可以重连。
- 同屏：填写四个昵称；每次交接点击“我已接手”才显示手牌。状态只保存在这台设备，离开牌桌会清除此局。
- 点击亮框牌出牌，万能牌选择颜色，强化定向牌另选目标。FLEX 先打开强化按钮。
- 剩两张时可提前喊 UNO，漏喊可被举报。加牌叠加、500分赛在开局时选择。
- 设置可关闭声音及震屏；系统“减少动态效果”默认关闭动画。

## 规则边界

依据 Mattel 经典 UNO、GDR44 FLIP 与 HMY99 FLEX 说明书实现，详细来源与规则在页面“游戏规则”中。

数字版约定：FLIP 每局随机生成双面配对，局内固定，非实体印刷配对复刻。FLEX 副色使用固定轮转分配。翻面后若新顶牌是万能，由下一位行动者选色。缺少可抽牌时只抽现有牌，避免无限循环。

可选叠加是房规，默认关闭。只叠同种数值加牌；不混接、不叠定向/群体/抽色。开启后数值万能加牌由系统强制合法，不再质疑。有人出完手牌时先结算最后一张罚牌，再计分。

## 本地开发

Node.js >=22.13，npm。依赖已经在当前交付目录安装。

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_tiresome_punisher.sql
npm run dev -- --port 5173
```

数据库迁移只在新的本地数据库执行一次。不要在已存在的表上重复执行。开发服务默认为本机访问。

```powershell
node --experimental-strip-types tests/game.test.mjs
node tests/room.test.mjs
```

后一个测试需要本地服务已经运行。测试使用本地四会话与D1，不代表真实跨地区网络延迟测量。

## 实现

- React / Vinext / TypeScript，Cloudflare Worker + D1 房间持久化。
- 服务端权威判定，版本比较更新避免同时操作覆盖；操作标识防止重复提交。
- 每个座位有随机凭证，服务器只存SHA-256摘要，客户端仅收到自己手牌。
- 房间状态约每1.1秒同步；不使用 WebSocket，不提供AI代打。
- 游戏核心在 lib/game.ts；在线接口 app/api/room/route.ts；页面 app/ui/arcade.tsx。
- 浏览器 WebMCP 提供只读牌桌工具，尊重同屏遮挡。

## 素材

- 卡牌彩蛋：桃井、小绿、爱丽丝、柚子藏在四种颜色的数字 7 中，每副牌每面 8 张。仅改变卡面和出牌闪光，不影响数字、颜色、FLEX 副色、能量或规则。玩家使用座位编号和自定义昵称。设置中可预览。
- 彩蛋插画：内置 imagegen 一次生成的同人素材；public/card-easter-eggs.png。原始生成提示词保留在 public/card-art-prompt.txt，图集现仅用于卡面。
- UNO牌面参考与下载素材：Dmitry Fomin / Wikimedia Commons / CC0 1.0，public/uno-cards-cc0.svg。
- 动态牌面为代码绘制的游戏UI；图标 Lucide（ISC）。
- UNO 与蔚蓝档案角色相关权利归各自权利人。本项目是非官方同人练习。

## 验证

- TypeScript 静态检查通过。
- 20项规则测试通过，包括300局四人模拟、牌数守恒、翻面顺序、强化能量、质疑与结算。
- 三种玩法的四会话联机测试通过，结果见 qa-network.json。
- 实际浏览器检查了桌面与390×844手机布局、同屏交接、出牌以及三个独立页面。

## GitHub 交付

仓库保存完整源码，访问权限为 Private。没有启用 GitHub Pages 或自动公开部署。线上四人房间需要服务端与D1数据库，纯静态 Pages 不能独立运行房间接口；本地开发和同屏模式可以按上方步骤运行。
