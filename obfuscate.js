const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const inputDir = path.join(__dirname, 'public', 'js');
const outputDir = path.join(__dirname, 'public', 'js', 'obfuscated');

if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

fs.readdir(inputDir, (err, files) => {
    if (err) {
        console.error('Could not list the directory.', err);
        process.exit(1);
    }

    files.forEach((file, index) => {
        const inputFilePath = path.join(inputDir, file);
        const outputFilePath = path.join(outputDir, file);

        // Check if the current item is a file
        fs.stat(inputFilePath, (err, stat) => {
            if (err) {
                console.error('Error stating file.', err);
                return;
            }

            if (stat.isFile()) {
                fs.readFile(inputFilePath, 'utf8', (err, data) => {
                    if (err) {
                        console.error('Error reading file.', err);
                        return;
                    }

                    const obfuscationResult = JavaScriptObfuscator.obfuscate(data, {
                        compact: true,
                        controlFlowFlattening: true,
                    });

                    fs.writeFile(outputFilePath, obfuscationResult.getObfuscatedCode(), (err) => {
                        if (err) {
                            console.error('Error writing obfuscated file.', err);
                            return;
                        }

                        console.log(`Successfully obfuscated ${file}`);
                    });
                });
            }
        });
    });
});
