import {spawnSync} from 'node:child_process';
import {networkInterfaces} from 'node:os';

const localAddress = Object.values(networkInterfaces())
  .flatMap(addresses => addresses ?? [])
  .find(address => address.family === 'IPv4' && !address.internal && isPrivateAddress(address.address))
  ?.address;

if (!localAddress) {
  console.error('No private IPv4 address was found. Connect the Mac to the same Wi-Fi network as the iPhone.');
  process.exit(1);
}

const developmentServerUrl = `http://${localAddress}:4200`;
console.log(`Configuring the iOS app to load ${developmentServerUrl}`);

const result = spawnSync('npx', ['cap', 'sync', 'ios'], {
  env: {
    ...process.env,
    CAPACITOR_DEV_SERVER_URL: developmentServerUrl,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

function isPrivateAddress(address) {
  return address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}
