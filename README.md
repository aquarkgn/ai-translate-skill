# AI Translate Skill

AI 多语言翻译处理技能，支持大模型翻译。这是一个专为 AI Agent 设计的技能，帮助你处理项目的多语言本地化（i18n）翻译任务。

## 核心功能

- **大模型驱动**：支持 GPT-4, Qwen 等主流大模型翻译引擎。
- **i18n 友好**：专门针对 JSON 格式的多语言模板设计。
- **模板保护**：自动识别并保护 `{{name}}` 或 `{{count}}` 等占位符，确保翻译后逻辑不受损。
- **语言校验**：内置合法语言字典，防止非规范翻译。

## 安装

```bash
git clone https://github.com/your-username/ai-translate-skill.git
cd ai-translate-skill
npm install
```

## 使用示例

使用 `ai-translate` CLI 工具进行翻译：

```bash
./bin/ai-translate.js \
  --template ./locales/en.json \
  --target zh \
  --output ./locales/zh.json \
  --ai-model gpt-4 \
  --ai-url https://api.openai.com/v1 \
  --ai-api-key YOUR_API_KEY
```

## 使用授权

**本项目采用自定义非商业化开源协议。**

1. **禁止商用**：严禁将本项目及其衍生成果用于任何形式的商业盈利目的。
2. **强制开源引用**：任何引用、克隆或基于本项目开发的作品，必须保持开源并包含对本项目的原始引用说明。

---

*由 Antigravity AI 自动生成并发布。*
