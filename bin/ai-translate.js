#!/usr/bin/env node

const { parseArgs, validateBaseOptions } = require('../src/validator');
const { runAITranslate } = require('../src/ai-engine');

async function main() {
    try {
        const options = parseArgs();
        const { templatePath, targetLang, outputPath } = validateBaseOptions(options);

        // 获取 AI 特定参数
        const model = options['ai-model'];
        const apiUrl = options['ai-url'];
        const apiKey = options['ai-api-key'];

        if (!model || !apiUrl || !apiKey) {
            throw new Error(`缺少 AI 翻译模型必须的参数：--ai-model, --ai-url, --ai-api-key`);
        }

        console.log(`🚀 开始 AI Model Translate 翻译任务`);
        console.log(`模板文件: ${templatePath}`);
        console.log(`目标语言: ${targetLang}`);
        console.log(`输出文件: ${outputPath}`);
        console.log(`调用模型: ${model}`);

        await runAITranslate(templatePath, targetLang, outputPath, model, apiKey, apiUrl);
    } catch (err) {
        console.error(`\n❌ [错误]: ${err.message}`);
        console.log(`\n使用示例:\n  ai-translate --template ./zh.json --target en --output ./en.json \\ \n    --ai-model gpt-4o --ai-url https://api.openai.com/v1/chat/completions --ai-api-key your-api-key\n`);
        process.exit(1);
    }
}

main();
