const fs = require('fs').promises;
const path = require('path');

async function removeDir(target) {
    try {
        await fs.rm(target, { recursive: true, force: true });
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

async function copyDir(source, destination) {
    await fs.mkdir(destination, { recursive: true });
    let entries = await fs.readdir(source, { withFileTypes: true });
    for (let entry of entries) {
        let srcPath = path.join(source, entry.name);
        let destPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function main() {
    const root = __dirname;
    const dist = path.join(root, 'dist');
    await removeDir(dist);
    await copyDir(path.join(root, 'src'), path.join(dist, 'src'));
    await copyDir(path.join(root, '_locales'), path.join(dist, '_locales'));
    await fs.copyFile(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
    console.log('Build complete: dist folder created.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
