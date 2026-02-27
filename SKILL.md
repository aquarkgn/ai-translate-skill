---
name: ai-translate-skill
description: AI 多语言翻译处理技能 (支持大模型翻译)
---

# AI Translate Skill

这是一个专为 AI Agent 设计的技能，帮助你处理项目的多语言本地化（i18n）翻译任务，使用 AI 模型翻译引擎。

## 能力范围
- 解析 JSON 格式的翻译模板文件。
- 根据目标语言代码 (`--target`) 将多语言文本进行对应的语种翻译。
- 自动保护和还原文本中的模板字符或插槽（例如 `{{name}}` 或 `{{count}}` 等）。
- 每次仅接受一个目标语言（Single Target Language）和唯一的输出路径。
- 内置数据字典校验。只有 `data/languages.json` 中定义过的合法目标语言才允许翻译。 

## 如何使用本技能

当用户明确要求使用大语言模型（如 GPT-4 / Qwen 等）进行翻译，或者需要极高的语境准确性时，调用 `ai-translate` CLI 工具。

命令格式：
```bash
./bin/ai-translate.js \
  --template <源文件> \
  --target <目标语言代码> \
  --output <输出文件> \
  --ai-model <模型名称> \
  --ai-url <API 地址> \
  --ai-api-key <您的 API_KEY>

### 模型调用建议 (Best Practice)
- **14B 模型**: 如果使用 `Qwen 14B` 等中大型模型，推荐 `--batch-size 20`。
- **GPT-4**: 推荐 `--batch-size 10-30` 视 Token 限制而定。
- **小模型**: 若出现 Key 丢失，请减小 `--batch-size` 至 5-10。
```

## 注意事项与规则
- **绝对路径**：在使用参数时，请尽量传入 `绝对路径` 以防止相对路径解析导致的问题。
- **语言支持校验**：工具会严格校验 `--target` 的值是否位于本项目的 `data/languages.json` 之中作为合法的语言代码（如 `en`, `pt`, `ja` 等）。
- **执行方式**：如果在项目之外作为全局命令可用（`npm link` 后），你可以直接运行 `ai-translate`。在项目内部，作为 Agent 你可以通过 `node bin/ai-translate.js` 的方式去执行。
