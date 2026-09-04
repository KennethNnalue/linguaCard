import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const expectedBundleId = 'app.linguacard';
const capacitorConfig = JSON.parse(readFileSync('ios/App/App/capacitor.config.json', 'utf8'));
const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const infoPlist = readFileSync('ios/App/App/Info.plist', 'utf8');

const failures = [];

if (capacitorConfig.appId !== expectedBundleId) {
  failures.push(`Capacitor appId must be ${expectedBundleId}.`);
}

if (capacitorConfig.server) {
  failures.push('Release Capacitor config must not contain a development server URL.');
}

if (!project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${expectedBundleId};`)) {
  failures.push(`Xcode bundle identifier must be ${expectedBundleId}.`);
}

if (project.includes('com.anugw.linguacard.dev')) {
  failures.push('Xcode project still contains the development bundle identifier.');
}

for (const requiredKey of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription']) {
  if (!infoPlist.includes(`<key>${requiredKey}</key>`)) {
    failures.push(`Info.plist is missing ${requiredKey}.`);
  }
}

for (const plist of ['ios/App/App/Info.plist', 'ios/App/App/PrivacyInfo.xcprivacy']) {
  try {
    execFileSync('plutil', ['-lint', plist], { stdio: 'pipe' });
  } catch {
    failures.push(`${plist} is not a valid property list.`);
  }
}

if (!project.includes('PrivacyInfo.xcprivacy in Resources')) {
  failures.push('PrivacyInfo.xcprivacy is not included in the Xcode Resources build phase.');
}

if (failures.length > 0) {
  process.stderr.write(`${failures.map(failure => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('iOS release configuration is valid.\n');
}
