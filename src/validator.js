const fs = require('fs');
const path = require('path');

// 读取支持的语言列表 (强制为 data/languages.json)
function loadLanguagesData() {
    const langFilePath = path.resolve(__dirname, '..', 'data', 'languages.json');
    if (!fs.existsSync(langFilePath)) {
        throw new Error(`找不到语言数据基准文件: ${langFilePath}`);
    }
    const data = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
    return data.languages.map(l => l.code);
}

// 解析命令行基本参数
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            options[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
        }
    }
    return options;
}

// 基础验证（两个命令通用的属性验证）
function validateBaseOptions(options) {
    const { template, target, output } = options;

    if (!template || !target || !output) {
        throw new Error('参数缺失。必须包含 --template, --target, 和 --output');
    }

    const templatePath = path.resolve(template);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`找不到模板文件: ${templatePath}`);
    }

    const validCodes = loadLanguagesData();
    if (!validCodes.includes(target)) {
        throw new Error(`无效的目标语言代码 "${target}"。请检查 data/languages.json。`);
    }

    return {
        templatePath,
        targetLang: target,
        outputPath: path.resolve(output),
    };
}

module.exports = {
    parseArgs,
    validateBaseOptions,
};
