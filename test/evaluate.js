const fs = require('fs');
const path = require('path');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const MODEL = "mlx-community/Qwen2.5-14B-Instruct-8bit";
const URL = "http://localhost:5001/v1/chat/completions";

function extractTranslatedKeys(originalObj, translatedObj, maxCount) {
    let result = [];
    function traverse(orig, trans, prefix = '') {
        for (const key in orig) {
            if (result.length >= maxCount) return;
            if (typeof orig[key] === 'object' && orig[key] !== null) {
                traverse(orig[key], trans?.[key] || {}, `${prefix}${key}.`);
            } else {
                if (trans && trans[key] && trans[key] !== orig[key]) {
                    result.push({
                        path: `${prefix}${key}`,
                        original: orig[key],
                        translated: trans[key]
                    });
                }
            }
        }
    }
    traverse(originalObj, translatedObj);
    return result; // return the first maxCount translations
}

async function evaluateBatch(batchSize) {
    const originalFile = path.join(__dirname, 'en.json');
    const transFile = path.join(__dirname, 'output', 'test_results', `test_bs_${batchSize}.json`);

    if (!fs.existsSync(transFile)) {
        return;
    }

    const original = JSON.parse(fs.readFileSync(originalFile, 'utf8'));
    const translated = JSON.parse(fs.readFileSync(transFile, 'utf8'));

    // Calculate how many keys were expected to be translated
    // We'll just extract the translated keys up to batchSize
    const pairs = extractTranslatedKeys(original, translated, batchSize * 2);

    console.log(`\n=== 评估 Batch Size: ${batchSize} ===`);
    console.log(`找到不同的键值对数量: ${pairs.length} (期望接近 ${batchSize})`);

    if (pairs.length === 0) {
        console.log(`无法评估，没有找到翻译的键`);
        return;
    }

    const testPairs = pairs.slice(0, Math.min(pairs.length, 5)); // Just test up to 5 examples for translation quality to save time

    const prompt = `请作为严格的翻译质量评测专家，对以下 JSON 文本的翻译内容（从英语到阿坎语 ak 或其他语言，请根据内容判断语言质量，如果不是阿坎语而是胡乱翻译请指出，通常测试可能是乱码或者未翻译）进行质量打分（0-10分），并指出是否有占位符丢失或语义不自然之处。
只需输出简短的评分和评价。

翻译样本:
${JSON.stringify(testPairs, null, 2)}`;

}

async function main() {
    const sizes = [10, 20, 50, 100, 200, 300, 400, 600, 800, 1000];
    for (let s of sizes) {
        await evaluateBatch(s);
    }
}

main();
