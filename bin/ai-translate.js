#!/usr/bin/env node

const { parseArgs, validateBaseOptions } = require('../src/validator');
const { runAITranslate } = require('../src/ai-engine');

async function main() {
    try {
        const options = parseArgs();
        const { templatePath, targetLang, outputPath } = validateBaseOptions(options);

        const model = options['ai-model'];
        const apiUrl = options['ai-url'];
        const apiKey = options['ai-api-key'];
        const force = options['force'] || false;
        const batchSize = options['batch-size'] ? parseInt(options['batch-size'], 10) : 100;
        const maxBatches = options['max-batches'] ? parseInt(options['max-batches'], 10) : 0;

        if (!model || !apiUrl || !apiKey) {
            throw new Error(`缺少 AI 翻译模型必须的参数：--ai-model, --ai-url, --ai-api-key`);
        }

        console.log(`🚀 开始 AI Model Translate 翻译任务`);
        console.log(`模板文件: ${templatePath}`);
        console.log(`目标语言: ${targetLang}`);
        console.log(`输出文件: ${outputPath}`);
        console.log(`强制重译: ${force}`);
        console.log(`批次大小: ${batchSize}`);
        if (maxBatches > 0) console.log(`最大批次数: ${maxBatches}`);
        console.log(`调用模型: ${model}`);

        await runAITranslate(templatePath, targetLang, outputPath, model, apiKey, apiUrl, force, batchSize, maxBatches);
    } catch (err) {
        console.error(`\n❌ [错误]: ${err.message}`);
        console.log(`\n使用示例:\n  ai-translate --template ./zh.json --target en --output ./en.json \\ \n    --ai-model gpt-4o --ai-url https://api.openai.com/v1/chat/completions --ai-api-key your-api-key\n`);
        process.exit(1);
    }
}

main();
