import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parsePythonDict(content) {
    const infoMatch = content.match(/info\s*=\s*(\{[\s\S]*\})/);
    if (!infoMatch) {
        throw new Error('Could not find info dict in Python file');
    }

    let dictStr = infoMatch[1];

    dictStr = dictStr
        .replace(/#.*$/gm, '')
        .replace(/'/g, '"')
        .replace(/True/g, 'true')
        .replace(/False/g, 'false')
        .replace(/None/g, 'null')
        .replace(/0[xX]([0-9a-fA-F]+)/g, '"0x$1"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

    try {
        return JSON.parse(dictStr);
    } catch (e) {
        console.error('Failed to parse JSON:', e.message);
        const lines = dictStr.split('\n');
        lines.forEach((line, i) => {
            console.log(`${i + 1}: ${line}`);
        });
        throw e;
    }
}

function convertToChipInfo(info) {
    const chipInfo = {
        id: info.id,
        chipMark: {},
        pinctrl: {}
    };

    if (info.name && info.mark_id) {
        info.name.forEach((name, i) => {
            const markId = info.mark_id[i];
            chipInfo.chipMark[name] = typeof markId === 'string' ? parseInt(markId, 16) : markId;
        });
    }

    const memoryMapping = info.memory_mapping || {};
    const gpioBase = memoryMapping.SUNXI_GPIO_BASE || 0x02000000;
    const rpioBase = memoryMapping.SUNXI_RPIO_BASE;

    const pinctrl = info.pinctrl || {};
    const pinBankNum = pinctrl.pin_bank_num || {};
    const pinMux = pinctrl.pin_mux || {};

    const pioPins = {};
    const rpioPins = {};
    const pioBankNum = {};
    const rpioBankNum = {};

    for (const [pinName, muxList] of Object.entries(pinMux)) {
        const bank = pinName.substring(0, 2);
        const bankLetter = bank.charAt(1);

        if (bankLetter >= 'L') {
            rpioPins[pinName] = muxList;
            if (!rpioBankNum[bank]) {
                rpioBankNum[bank] = pinBankNum[bank] || 0;
            }
        } else {
            pioPins[pinName] = muxList;
            if (!pioBankNum[bank]) {
                pioBankNum[bank] = pinBankNum[bank] || 0;
            }
        }
    }

    if (Object.keys(pioBankNum).length > 0) {
        chipInfo.pinctrl.pio = {
            reg_base: typeof gpioBase === 'string' ? parseInt(gpioBase, 16) : gpioBase,
            version: (info.ip_ver && info.ip_ver.PINCTRL) || 2,
            pin_bank_num: pioBankNum,
            pin_mux: pioPins
        };
    }

    if (Object.keys(rpioBankNum).length > 0 && rpioBase) {
        chipInfo.pinctrl.rtc_pio = {
            reg_base: typeof rpioBase === 'string' ? parseInt(rpioBase, 16) : rpioBase,
            version: (info.ip_ver && info.ip_ver.PINCTRL) || 2,
            pin_bank_num: rpioBankNum,
            pin_mux: rpioPins
        };
    }

    return chipInfo;
}

function generateTypeScript(chipInfo) {
    const lines = [
        `import type { ChipInfo } from '../Drivers/Types';`,
        '',
        `export const aw${chipInfo.id}: ChipInfo = {`,
        `    id: '${chipInfo.id}',`,
        `    chipMark: {`
    ];

    const marks = Object.entries(chipInfo.chipMark);
    marks.forEach(([key, value], i) => {
        const comma = i < marks.length - 1 ? ',' : '';
        lines.push(`        "${key}": 0x${value.toString(16).toUpperCase()}${comma}`);
    });

    lines.push(`    },`);
    lines.push(`    pinctrl: {`);

    for (const [ctrlName, ctrl] of Object.entries(chipInfo.pinctrl)) {
        lines.push(`        ${ctrlName}: {`);
        lines.push(`            reg_base: 0x${ctrl.reg_base.toString(16).toUpperCase()},`);
        lines.push(`            version: ${ctrl.version},`);
        lines.push(`            pin_bank_num: {`);

        const banks = Object.entries(ctrl.pin_bank_num);
        banks.forEach(([bank, num], i) => {
            const comma = i < banks.length - 1 ? ',' : '';
            lines.push(`                ${bank}: ${num}${comma}`);
        });

        lines.push(`            },`);
        lines.push(`            pin_mux: {`);

        const pins = Object.entries(ctrl.pin_mux);
        pins.forEach(([pin, mux], i) => {
            const muxStr = JSON.stringify(mux);
            const comma = i < pins.length - 1 ? ',' : '';
            lines.push(`                ${pin}: ${muxStr}${comma}`);
        });

        lines.push(`            },`);
        lines.push(`        },`);
    }

    lines.push(`    }`);
    lines.push(`};`);

    return lines.join('\n');
}

function convertFile(inputPath, outputDir) {
    console.log(`Converting: ${inputPath}`);

    const content = fs.readFileSync(inputPath, 'utf-8');
    const info = parsePythonDict(content);
    const chipInfo = convertToChipInfo(info);
    const tsCode = generateTypeScript(chipInfo);

    const outputPath = path.join(outputDir, `aw${chipInfo.id}.ts`);
    fs.writeFileSync(outputPath, tsCode, 'utf-8');

    console.log(`  -> ${outputPath}`);
    return outputPath;
}

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node convert-chip-def.js <input.py> [output-dir]');
        console.log('       node convert-chip-def.js --all <input-dir> <output-dir>');
        process.exit(1);
    }

    const defaultOutputDir = path.join(__dirname, '..', 'src', 'Chips');

    if (args[0] === '--all') {
        const inputDir = args[1];
        const outputDir = args[2] || defaultOutputDir;

        const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.py'));

        console.log(`Found ${files.length} Python files to convert`);

        for (const file of files) {
            try {
                convertFile(path.join(inputDir, file), outputDir);
            } catch (e) {
                console.error(`Failed to convert ${file}: ${e.message}`);
            }
        }

        console.log('Done!');
    } else {
        const inputPath = args[0];
        const outputDir = args[1] || defaultOutputDir;

        convertFile(inputPath, outputDir);
    }
}

main();
