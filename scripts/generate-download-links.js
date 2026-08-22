import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function generateDownloadLinks(version) {
  const releaseBase = `https://github.com/dshanpi/DshanPI_USBToolBox/releases/download/v${version}`;
  const lines = [
    '### Downloads',
    '',
    '#### Windows x64',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| Installer | [USBToolBox_${version}_x64-setup.exe](${releaseBase}/USBToolBox_${version}_x64-setup.exe) |`,
    `| MSI | [USBToolBox_${version}_x64_en-US.msi](${releaseBase}/USBToolBox_${version}_x64_en-US.msi) |`,
    `| Portable | [usbtoolbox-app_windows_x64.exe](${releaseBase}/usbtoolbox-app_windows_x64.exe) |`,
    '',
    '**Dependencies:** https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/?form=MA13LH#download',
    '',
    '#### Windows ARM64',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| Installer | [USBToolBox_${version}_arm64-setup.exe](${releaseBase}/USBToolBox_${version}_arm64-setup.exe) |`,
    `| MSI | [USBToolBox_${version}_arm64_en-US.msi](${releaseBase}/USBToolBox_${version}_arm64_en-US.msi) |`,
    `| Portable | [usbtoolbox-app_windows_arm64.exe](${releaseBase}/usbtoolbox-app_windows_arm64.exe) |`,
    '',
    '**Dependencies:** https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/?form=MA13LH#download',
    '',
    '#### Linux x64',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| AppImage | [USBToolBox_${version}_amd64.AppImage](${releaseBase}/USBToolBox_${version}_amd64.AppImage) |`,
    `| DEB | [USBToolBox_${version}_amd64.deb](${releaseBase}/USBToolBox_${version}_amd64.deb) |`,
    `| RPM | [USBToolBox-${version}-1.x86_64.rpm](${releaseBase}/USBToolBox-${version}-1.x86_64.rpm) |`,
    `| Portable | [usbtoolbox-app_linux_x64](${releaseBase}/usbtoolbox-app_linux_x64) |`,
    '',
    '**Dependencies:** libusb-1.0-0-dev (Debian/Ubuntu: sudo apt-get install libusb-1.0-0-dev)',
    '',
    '#### Linux aarch64',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| AppImage | [USBToolBox_${version}_aarch64.AppImage](${releaseBase}/USBToolBox_${version}_aarch64.AppImage) |`,
    `| DEB | [USBToolBox_${version}_arm64.deb](${releaseBase}/USBToolBox_${version}_arm64.deb) |`,
    `| RPM | [USBToolBox-${version}-1.aarch64.rpm](${releaseBase}/USBToolBox-${version}-1.aarch64.rpm) |`,
    `| Portable | [usbtoolbox-app_linux_arm64](${releaseBase}/usbtoolbox-app_linux_arm64) |`,
    '',
    '**Dependencies:** libusb-1.0-0-dev (Debian/Ubuntu: sudo apt-get install libusb-1.0-0-dev)',
    '',
    '#### macOS (Apple Silicon)',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| DMG | [USBToolBox_${version}_aarch64.dmg](${releaseBase}/USBToolBox_${version}_aarch64.dmg) |`,
    `| PKG | [USBToolBox_aarch64.app.tar.gz](${releaseBase}/USBToolBox_aarch64.app.tar.gz) |`,
    `| Portable | [usbtoolbox-app_darwin_aarch64](${releaseBase}/usbtoolbox-app_darwin_aarch64) |`,
    '',
    '**Dependencies:** libusb (Homebrew: brew install libusb)',
    'macOS needs to disable Signing check for the app to run. by xattr -cr USBToolBox_aarch64.app',
    '',
    '#### Android',
    '',
    '**Android Version only for fun, not really usable**',
    '',
    '| Type | Download |',
    '|------|----------|',
    `| apk | [USBToolBox-${version}.apk](${releaseBase}/USBToolBox-${version}.apk) |`,
  ];

  return lines.join('\n');
}

const version = process.argv[2];

if (!version) {
  console.error('Usage: node generate-download-links.js <version>');
  console.error('Example: node generate-download-links.js 1.0.0');
  process.exit(1);
}

const links = generateDownloadLinks(version);
console.log(links);

if (process.argv.includes('--output-file')) {
  const outputPath = join(__dirname, 'download-links.txt');
  writeFileSync(outputPath, links, 'utf-8');
  console.log(`\nDownload links saved to: ${outputPath}`);
}
