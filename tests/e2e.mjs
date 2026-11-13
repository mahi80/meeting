import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'msedge',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--auto-select-desktop-capture-source=Entire screen',
    '--enable-usermedia-screen-capturing',
  ],
});

const hostContext = await browser.newContext({
  permissions: ['camera', 'microphone'],
  viewport: { width: 1440, height: 900 },
});
const guestContext = await browser.newContext({
  permissions: ['camera', 'microphone'],
  viewport: { width: 1280, height: 800 },
});
const host = await hostContext.newPage();
const guest = await guestContext.newPage();

const errors = [];
host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
host.on('console', (message) => {
  if (message.type() === 'error') console.log('[host console]', message.text().slice(0, 200));
});

function step(name) {
  console.log(`- ${name}`);
}

try {
  step('host creates a meeting');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.fill('#meeting-title', 'E2E standup');
  await host.getByRole('button', { name: 'Start meeting' }).click();

  step('host prejoin');
  await host.waitForSelector('#join-name', { timeout: 15000 });
  await host.fill('#join-name', 'Host Mahendra');
  await host.getByRole('button', { name: 'Join as host' }).click();

  step('host is in the room, invite dialog auto-opens');
  await host.getByRole('heading', { name: 'Invite people' }).waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${SHOTS}01-host-invite.png` });
  const guestUrl = await host.locator('input[readonly]').first().inputValue();
  console.log('  guest url:', guestUrl);
  await host.locator('[aria-label="Close"]').click();
  await host.waitForTimeout(1200);
  await host.screenshot({ path: `${SHOTS}02-host-alone.png` });

  step('guest opens invite link and waits for admission');
  await guest.goto(guestUrl, { waitUntil: 'networkidle' });
  await guest.waitForSelector('#join-name', { timeout: 15000 });
  await guest.fill('#join-name', 'Guest Priya');
  await guest.screenshot({ path: `${SHOTS}03-guest-prejoin.png` });
  await guest.getByRole('button', { name: 'Join meeting' }).click();
  await guest.getByText('Waiting for the host').waitFor({ timeout: 15000 });
  await guest.screenshot({ path: `${SHOTS}04-guest-waiting.png` });

  step('host sees the waiting request and admits');
  await host.locator('button[aria-label="People"]').click();
  const admit = host.getByRole('button', { name: 'Admit' });
  await admit.waitFor({ timeout: 15000 });
  await host.screenshot({ path: `${SHOTS}05-host-waiting-room.png` });
  await admit.click();

  step('guest is admitted and joins the room');
  await guest.getByRole('button', { name: 'Leave meeting' }).waitFor({ timeout: 20000 });
  await guest.waitForTimeout(1500);
  await host.waitForTimeout(1500);
  await host.screenshot({ path: `${SHOTS}06-host-two-people.png` });
  await guest.screenshot({ path: `${SHOTS}07-guest-two-people.png` });

  const hostVideos = await host.evaluate(() => document.querySelectorAll('video').length);
  const guestVideos = await guest.evaluate(() => document.querySelectorAll('video').length);
  console.log('  video elements host/guest:', hostVideos, guestVideos);

  step('chat both ways');
  await guest.locator('button[aria-label="Chat"]').click();
  await guest.fill('textarea[placeholder="Message everyone"]', 'Hello from the guest');
  await guest.locator('button[title="Send message"]').click();
  await host.locator('button[aria-label="Chat"]').click();
  await host.getByText('Hello from the guest').waitFor({ timeout: 8000 });
  await host.fill('textarea[placeholder="Message everyone"]', 'Welcome Priya!');
  await host.locator('button[title="Send message"]').click();
  await guest.getByText('Welcome Priya!').waitFor({ timeout: 8000 });
  await host.screenshot({ path: `${SHOTS}08-host-chat.png` });
  await guest.screenshot({ path: `${SHOTS}09-guest-chat.png` });

  step('host shares screen');
  let shared = false;
  try {
    await host.locator('button[aria-label="Share"]').click();
    await host.getByText('You are sharing your screen').waitFor({ timeout: 10000 });
    await host.waitForTimeout(1500);
    await guest.getByText(/is sharing/).waitFor({ timeout: 10000 });
    await host.screenshot({ path: `${SHOTS}10-host-sharing.png` });
    await guest.screenshot({ path: `${SHOTS}11-guest-viewing-share.png` });
    shared = true;
    await host.getByRole('button', { name: 'Stop', exact: true }).click();
    await host.waitForTimeout(1000);
  } catch (error) {
    console.log('  screen share not available in this headless run:', error.message.split('\n')[0]);
  }

  step('speaker view toggle');
  await host.locator('button[aria-label="Meeting chat"]').click();
  await host.locator('button[aria-label="Participants and waiting room"]').click();
  await host.locator('button[aria-label="Switch to speaker view"]').click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${SHOTS}12-host-speaker-view.png` });

  step('guest leaves');
  await guest.locator('button[aria-label="Leave meeting"]').click();
  await guest.getByRole('heading', { name: 'You left the meeting' }).waitFor({ timeout: 10000 });
  await guest.screenshot({ path: `${SHOTS}13-guest-left.png` });

  console.log(JSON.stringify({ ok: true, shared, hostVideos, guestVideos, errors }, null, 2));
} catch (error) {
  console.error('E2E FAILED:', error);
  await host.screenshot({ path: `${SHOTS}99-host-failure.png` }).catch(() => {});
  await guest.screenshot({ path: `${SHOTS}99-guest-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}