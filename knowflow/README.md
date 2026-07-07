# KnowFlow · 个人知识库

基于 RinUI Fluent Design 暗色主题的全栈知识库管理系统。

## 项目结构

```
knowflow/
├── index.html              # RinUI 前端界面
├── css/knowflow.css        # RinUI 暗色主题样式
├── js/knowflow.js          # 前端逻辑 (localStorage 离线模式)
├── python/                 # Python Flask 后端
│   ├── main.py             # 入口 (开发/生产模式)
│   ├── requirements.txt    # 依赖
│   └── app/
│       ├── config.py       # 配置
│       ├── models.py       # JSON 文件存储模型
│       └── routes/notes.py # REST API 路由
├── java/                   # Java Spring Boot 后端
│   ├── pom.xml             # Maven 配置
│   └── src/main/java/knowflow/
│       ├── KnowFlowApplication.java
│       ├── controller/NoteController.java
│       ├── model/Note.java
│       ├── service/NoteService.java
│       └── config/CorsConfig.java
└── README.md
```

## 启动方式

### 前端（无需后端）
直接用浏览器打开 `knowflow/index.html`。数据存储在浏览器 localStorage。

### Python 后端
```bash
cd knowflow/python
pip install -r requirements.txt
python main.py              # 开发模式 (端口 5001)
python main.py --prod       # 生产模式
```

### Java 后端
```bash
cd knowflow/java
mvn spring-boot:run         # 端口 5002
```

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/notes | 笔记列表 (?search=&category=&tag=&favorite=true) |
| GET | /api/notes/:id | 获取单条笔记 |
| POST | /api/notes | 创建笔记 |
| PUT | /api/notes/:id | 更新笔记 |
| DELETE | /api/notes/:id | 删除笔记 |
| GET | /api/categories | 分类列表 |
| POST | /api/categories | 创建分类 |
| DELETE | /api/categories/:name | 删除分类 |

Python 和 Java 后端 API 完全等价，前端可无缝切换。
