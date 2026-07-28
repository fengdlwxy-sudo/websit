#!/usr/bin/env node
/**
 * 合并本地 data/*.json 与远程 GitHub 版本。
 * 规则：以本地为优先显示源，远程仅补充本地缺失的记录（按 id/slug/title 去重）。
 * 用于 deploy 前避免后台直写 GitHub 的新文章/数据被本地旧数据覆盖。
 */
const fs = require('fs');
const path = require('path');

function keyOf(x) {
    if (x && typeof x === 'object') {
        if (x.id !== undefined) return String(x.id);
        if (x.slug !== undefined) return String(x.slug);
        if (x.title !== undefined) return String(x.title);
    }
    return null;
}

function mergeList(local, remote) {
    const map = new Map();
    for (const x of local || []) {
        const k = keyOf(x);
        if (k && !map.has(k)) map.set(k, x);
    }
    for (const x of remote || []) {
        const k = keyOf(x);
        if (k && !map.has(k)) map.set(k, x);
    }
    return Array.from(map.values());
}

function mergeJson(local, remote) {
    if (local == null) return remote;
    if (remote == null) return local;
    if (Array.isArray(local) && Array.isArray(remote)) {
        return mergeList(local, remote);
    }
    if (typeof local === 'object' && typeof remote === 'object') {
        const out = { ...local };
        for (const key of Object.keys(remote)) {
            if (!(key in out)) {
                out[key] = remote[key];
            } else {
                const lv = out[key];
                const rv = remote[key];
                if (Array.isArray(lv) && Array.isArray(rv)) {
                    out[key] = mergeList(lv, rv);
                } else if (typeof lv === 'object' && typeof rv === 'object') {
                    out[key] = mergeJson(lv, rv);
                }
                // 其他标量类型保留本地值
            }
        }
        return out;
    }
    return local;
}

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: node merge-data.js <data-dir> <remote-json-dir>');
        process.exit(1);
    }
    const [dataDir, remoteDir] = args;
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        const localPath = path.join(dataDir, file);
        const remotePath = path.join(remoteDir, file);
        if (!fs.existsSync(remotePath)) {
            console.log(`(no remote ${file}, keep local)`);
            continue;
        }
        try {
            const local = readJson(localPath);
            const remote = readJson(remotePath);
            const merged = mergeJson(local, remote);
            writeJson(localPath, merged);
            console.log(`[OK] merged ${file}`);
        } catch (err) {
            console.log(`(skip ${file} merge, ${err.message})`);
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
