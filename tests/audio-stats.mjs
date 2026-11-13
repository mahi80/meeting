import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';

const browser = await chromium.launch({
  headless: true,
  channel: 'msedge',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const patch = () => {
  const Original = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = function (...args) {
    const pc = new Original(...args);
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Original.prototype;
};

const hostContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
const guestContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
await hostContext.addInitScript(patch);
await guestContext.addInitScript(patch);

const host = await hostContext.newPage();
const guest = await guestContext.newPage();

async function readStats(page, direction, kind) {
  return page.evaluate(
    async ({ direction, kind }) => {
      const pcs = window.__pcs ?? [];
      let bytes = 0;
      let lost = 0;
      let jitter = 0;
      for (const pc of pcs) {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type !== `${direction}-rtp` || report.kind !== kind) return;
          bytes += direction === 'inbound' ? (report.bytesReceived ?? 0) : (report.bytesSent ?? 0);
          lost += report.packetsLost ?? 0;
          jitter = Math.max(jitter, (report.jitter ?? 0) * 1000);
        });
      }
      return { bytes, lost, jitter };
    },
    { direction, kind },
  );
}

try {
  console.log('- host creates and joins');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByRole('button', { name: 'Start meeting' }).click();
  await host.waitForSelector('#join-name');
  await host.fill('#join-name', 'Host');
  await host.getByRole('button', { name: 'Join as host' }).click();
  const guestUrl = await host.locator('input[readonly]').first().inputValue();
  await host.locator('[aria-label="Close"]').click();

  console.log('- guest joins and is admitted');
  await guest.goto(guestUrl, { waitUntil: 'networkidle' });
  await guest.waitForSelector('#join-name');
  await guest.fill('#join-name', 'Guest');
  await guest.getByRole('button', { name: 'Join meeting' }).click();
  await host.locator('button[aria-label="People"]').click();
  await host.getByRole('button', { name: 'Admit' }).click();
  await guest.getByRole('button', { name: 'Leave meeting' }).waitFor();
  await host.waitForTimeout(5000);

  const seconds = 10;
  const audioStart = await readStats(host, 'inbound', 'audio');
  const videoStart = await readStats(guest, 'outbound', 'video');
  await host.waitForTimeout(seconds * 1000);
  const audioEnd = await readStats(host, 'inbound', 'audio');
  const videoEnd = await readStats(guest, 'outbound', 'video');

  const audioKbps = ((audioEnd.bytes - audioStart.bytes) * 8) / (seconds * 1000);
  const videoKbps = ((videoEnd.bytes - videoStart.bytes) * 8) / (seconds * 1000);
  const audioLoss = audioEnd.lost - audioStart.lost;

  console.log(
    `  voice received by host: ${audioKbps.toFixed(1)} kbps, lost packets ${audioLoss}, jitter ${audioEnd.jitter.toFixed(0)} ms`,
  );
  console.log(`  camera sent by guest:    ${videoKbps.toFixed(1)} kbps`);
  const ok = audioKbps > 8 && audioKbps < 80 && audioLoss === 0;
  console.log(JSON.stringify({ ok, audioKbps, videoKbps, audioLoss }, null, 2));
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error('AUDIO STATS FAILED:', error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
