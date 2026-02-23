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
    const systemPrompt = `You are a top-tier multilingual localization expert, proficient in software development, UI/UX design, and cross-cultural communication.
Your ONLY task is to accurately and naturally translate the text in the following JSON data into the target language: [ ${targetLang} ].

You MUST strictly adhere to the following translation and output guidelines:
1. [Industry terminology alignment] Use modern Web/App and software engineering standard terminology. Ensure a professional, natural, and friendly tone. // 【行业术语对齐】：使用现代软件工程标准术语，保持专业与自然的语气。
2. [Variable and format protection] NEVER translate, modify, or lose any placeholders (e.g., {{xxx}}, {xxx}, %s), HTML tags (e.g., <b>), or special symbols. Preserving their original forms and grammatical positions. // 【格式绝对保护】：严禁修改占位符、HTML标签和特殊符号。
3. [Contextual inference] Infer the scenario based on the incoming JSON Key (e.g., "btn" for short, actionable buttons; "msg" for full, clear prompts). // 【上下文推理】：参考 JSON Key 推断应用场景。
4. [UI length limits] Translations should be as concise as possible to avoid interface text overflow. // 【UI 长度限制】：翻译尽量简明扼要，避免溢出。
5. [Punctuation preservation] Try to keep the ending punctuation consistent with the original text (e.g., ... or ?). // 【标点保持】：维持与原文一致的末尾标点。
6. [Data structure consistency] Your returned result MUST be a valid JSON object. Keys MUST exactly match the input. DO NOT add, remove, modify, or rename any Key. You MUST only translate the Values. Currently, there are ${keysCount} fields to be translated. The returned JSON MUST contain exactly ${keysCount} fields, without omission! // 【数据结构一致性】：返回必须是合法JSON且Key完全相同，严禁遗漏！当前共有 ${keysCount} 个字段，必须返回正好 ${keysCount} 个！
7. [Pure JSON output] DO NOT include any Markdown formatting (e.g., \`\`\`json), explanations, prefixes, or notes. ONLY return a purely parsable JSON string! // 【纯 JSON 输出】：不包含任何 Markdown 标记或附加文本。只返回纯净的 JSON 字符串！`;

    const userContent = JSON.stringify(batchMap, null, 2);
    return await callAI(systemPrompt, userContent, model, apiKey, apiUrl);
}

async function runAITranslate(templatePath, targetLang, outputPath, model, apiKey, apiUrl, force = false) {
    console.log('加载源模板文件...');
    const sourceData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const allNodes = extractNodes(sourceData);

    console.log(`\n >>> 正在使用 AI 模型 ${model} 处理语言: ${targetLang} `);

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
        if (!force) {
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
            const safeKey = `idx_${idx}_${contextHint} `;
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
                    const safeKey = `idx_${idx}_${contextHint} `;
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
                console.error(`    [错误] 翻译批次失败(第 ${i + 1} -${i + chunk.length} 条) - 尝试重试 ${retryCount}/3:`, err.message);
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
