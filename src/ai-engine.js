const fs = require('fs');
const {
    extractNodes,
    getNestedValue,
    setNestedValue,
    needsTranslation
} = require('./utils');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const BATCH_SIZE = 20;

async function callAI(systemPrompt, userContent, model, apiKey, apiUrl) {
    const response = await fetch(`${apiUrl}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: 0.1,
            max_tokens: 4096,
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    let content = result.choices[0].message.content;
    try {
        return JSON.parse(content);
    } catch (e) {
        content = content.replace(/^```json/m, '').replace(/```$/m, '').trim();
        return JSON.parse(content);
    }
}

async function translateBatch(batchMap, targetLang, model, apiKey, apiUrl) {
    const keysCount = Object.keys(batchMap).length;
    const systemPrompt = `你是一名顶级的多语言本地化专家，精通软件开发、UI/UX 设计及跨文化交流。
你的唯一任务是将以下 JSON 数据中的文本精准、地道地翻译为目标语言：[ ${targetLang} ]。

必须严格遵守以下翻译与输出准则：
1. 【行业术语对齐】：使用现代 Web/App 及软件工程领域的标准术语，确保符合目标用户的常规认知。文本的语气需专业、自然、友好。
2. 【变量与格式绝对保护】：严禁翻译、修改或丢失任何占位符（如 {{xxx}}, {xxx}, %s, %d）、HTML 标签（如 <b>, <br>）以及特殊符号。它们必须原样保留并在译文中位于合理的语法位置。
3. 【上下文推理】：参考输入的 JSON Key 推断应用场景（如带有 "btn" 的通常是按钮，需简短且具有行动号召力；带有 "msg" 的通常是提示语，需完整清晰）。
4. 【UI 长度限制】：翻译应尽量简明扼要，避免导致界面文字溢出。
5. 【标点保持】：尽量维持与原文一致的末尾标点符号（如省略号... 或问号？）。
6. 【数据结构一致性】：你返回的结果必须是合法的 JSON 对象。Key 必须与输入完全相同，不论层级有多深，绝不能增减、修改或重命名任何 Key，只能翻译其对应的 Value。当前有 ${keysCount} 个字段需要翻译，返回的 JSON 必须包含正好 ${keysCount} 个对应的字段，严禁遗漏！
7. 【纯 JSON 输出】：不要包含任何 Markdown 标记（例如不要用 \`\`\`json 包裹），不要包含任何解释、前缀、后缀或备注。只返回纯粹的可解析 JSON 字符串！`;

    const userContent = JSON.stringify(batchMap, null, 2);
    return await callAI(systemPrompt, userContent, model, apiKey, apiUrl);
}

async function runAITranslate(templatePath, targetLang, outputPath, model, apiKey, apiUrl) {
    console.log('加载源模板文件...');
    const sourceData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const allNodes = extractNodes(sourceData);

    console.log(`\n>>> 正在使用 AI 模型 ${model} 处理语言: ${targetLang}`);

    let translatedData = {};
    if (fs.existsSync(outputPath)) {
        try {
            translatedData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        } catch (e) {
            translatedData = {};
        }
    }

    const pendingNodes = [];
    for (const node of allNodes) {
        const existingVal = getNestedValue(translatedData, node.path);
        const sourceVal = node.text;

        if (node.skipTranslate) {
            setNestedValue(translatedData, node.path, existingVal !== undefined ? existingVal : sourceVal);
            continue;
        }

        let isTranslated = false;
        if (existingVal) {
            if (existingVal !== sourceVal) {
                isTranslated = true;
            } else if (!needsTranslation(sourceVal)) {
                isTranslated = true;
            }
        } else if (!needsTranslation(sourceVal)) {
            isTranslated = true;
            setNestedValue(translatedData, node.path, sourceVal);
        }

        if (!isTranslated) {
            pendingNodes.push(node);
        } else {
            setNestedValue(translatedData, node.path, existingVal || sourceVal);
        }
    }

    if (pendingNodes.length === 0) {
        console.log(`- ${targetLang} 已经无须再翻译，完全同步。`);
        fs.writeFileSync(outputPath, JSON.stringify(translatedData, null, 2));
        return;
    }

    console.log(`- 发现 ${pendingNodes.length} 条需要翻译的文本，开始分块(Batch)翻译...`);

    for (let i = 0; i < pendingNodes.length; i += BATCH_SIZE) {
        const chunk = pendingNodes.slice(i, i + BATCH_SIZE);
        const batchMap = {};

        chunk.forEach((node, idx) => {
            const contextHint = node.path.slice(-2).map(p => p.replace(/[^a-zA-Z0-9]/g, '')).join('_');
            const safeKey = `idx_${idx}_${contextHint}`;
            batchMap[safeKey] = node.text;
        });

        console.log(`  -> 正在请求翻译第 ${i + 1} 到 ${i + chunk.length} 条数据...`);
        let retryCount = 0;
        let success = false;

        while (!success && retryCount < 3) {
            try {
                const translatedBatch = await translateBatch(batchMap, targetLang, model, apiKey, apiUrl);

                chunk.forEach((node, idx) => {
                    const contextHint = node.path.slice(-2).map(p => p.replace(/[^a-zA-Z0-9]/g, '')).join('_');
                    const safeKey = `idx_${idx}_${contextHint}`;
                    const tText = translatedBatch[safeKey];

                    if (tText) {
                        setNestedValue(translatedData, node.path, tText);
                    } else {
                        console.warn(`    [警告] 丢失翻译项，原文本: "${node.text}"`);
                        setNestedValue(translatedData, node.path, node.text);
                    }
                });

                fs.writeFileSync(outputPath, JSON.stringify(translatedData, null, 2));
                success = true;
            } catch (err) {
                retryCount++;
                console.error(`    [错误] 翻译批次失败 (第 ${i + 1}-${i + chunk.length} 条) - 尝试重试 ${retryCount}/3:`, err.message);
                if (retryCount >= 3) {
                    console.error('    达到最大重试次数，跳过此批次。');
                }
            }
        }
    }

    console.log(`语言 ${targetLang} 首批翻译成功完成。文件输出于 ${outputPath}`);
}

module.exports = {
    runAITranslate
};
