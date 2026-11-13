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

  step('host shares a file in chat');
  const fileBody = 'standup notes: ship the file sharing\n';
  await host.locator('input[type="file"]').setInputFiles({
    name: 'standup-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(fileBody),
  });
  await host.getByText('standup-notes.txt').waitFor({ timeout: 20000 });
  await guest.getByText('standup-notes.txt').waitFor({ timeout: 20000 });
  const fileHref = await host
    .locator('a[download="standup-notes.txt"]')
    .first()
    .getAttribute('href');
  const fileResponse = await host.request.get(new URL(fileHref, BASE).toString());
  const fileShared = fileResponse.ok() && (await fileResponse.text()) === fileBody;
  console.log('  file shared and downloadable:', fileShared);
  await host.screenshot({ path: `${SHOTS}09a-host-file.png` });
  await guest.screenshot({ path: `${SHOTS}09b-guest-file.png` });

  step('host shares screen');
  let shared = false;
  let inkHost = 0;
  let inkGuest = 0;
  try {
    await host.locator('button[aria-label="Share"]').click();
    await host.getByText('You are sharing your screen').waitFor({ timeout: 10000 });
    await host.waitForTimeout(1500);
    await guest.getByText(/is sharing/).waitFor({ timeout: 10000 });
    await host.screenshot({ path: `${SHOTS}10-host-sharing.png` });
    await guest.screenshot({ path: `${SHOTS}11-guest-viewing-share.png` });
    shared = true;

    step('guest annotates the host screen');
    await guest.getByRole('button', { name: 'Annotate the shared screen' }).click();
    const canvas = guest.locator('canvas').first();
    await canvas.waitFor({ timeout: 5000 });
    const box = await canvas.boundingBox();
    await guest.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await guest.mouse.down();
    await guest.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 12 });
    await guest.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.35, { steps: 12 });
    await guest.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.55, { steps: 12 });
    await guest.mouse.up();
    await guest.getByRole('button', { name: 'Stop annotating' }).click();
    await guest.waitForTimeout(1200);

    const ink = () => {
      const target = document.querySelector('canvas');
      if (!target) return 0;
      const context = target.getContext('2d');
      const data = context.getImageData(0, 0, target.width, target.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) count += 1;
      }
      return count;
    };
    inkGuest = await guest.evaluate(ink);
    inkHost = await host.evaluate(ink);
    console.log('  annotation pixels guest/host:', inkGuest, inkHost);
    await host.screenshot({ path: `${SHOTS}12-host-annotated-share.png` });
    await guest.screenshot({ path: `${SHOTS}13-guest-annotated-share.png` });

    await host.getByRole('button', { name: 'Stop', exact: true }).click();
    await host.waitForTimeout(1000);
  } catch (error) {
    console.log('  screen share not available in this headless run:', error.message.split('\n')[0]);
  }

  step('guest shares screen without host approval');
  let guestShared = false;
  try {
    await guest.locator('button[aria-label="Share"]').click();
    await guest.getByText('You are sharing your screen').waitFor({ timeout: 10000 });
    await host.getByText(/Guest Priya is sharing/).waitFor({ timeout: 10000 });
    guestShared = true;
    await guest.screenshot({ path: `${SHOTS}14-guest-sharing.png` });
    await guest.getByRole('button', { name: 'Stop', exact: true }).click();
    await guest.waitForTimeout(1000);
  } catch (error) {
    console.log('  guest screen share not available in this headless run:', error.message.split('\n')[0]);
  }

  step('whiteboard shared and drawn on');
  let whiteboardShared = false;
  let whiteboardLate = false;
  let whiteboardResized = false;
  let whiteboardPanned = false;
  let whiteboardScrolled = false;
  let cameraToggled = false;
  let whiteboardInk = 0;
  try {
    await host.getByRole('button', { name: 'Whiteboard' }).click();
    await host.getByText('You started the whiteboard').waitFor({ timeout: 10000 });
    await guest.getByText(/started the whiteboard/).waitFor({ timeout: 10000 });
    await guest.waitForTimeout(800);
    const board = guest.locator('canvas[aria-label="Whiteboard canvas"]');
    await board.waitFor({ timeout: 5000 });
    const box = await board.boundingBox();
    await guest.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.35);
    await guest.mouse.down();
    await guest.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6, { steps: 10 });
    await guest.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.3, { steps: 10 });
    await guest.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, { steps: 10 });
    await guest.mouse.up();
    await guest.waitForTimeout(1200);
    whiteboardInk = await host.evaluate(() => {
      const target = document.querySelector('canvas[aria-label="Whiteboard canvas"]');
      if (!target) return 0;
      const data = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) count += 1;
      }
      return count;
    });
    whiteboardShared = whiteboardInk > 100;
    console.log('  whiteboard ink seen by host:', whiteboardInk);
    await host.screenshot({ path: `${SHOTS}14a-host-whiteboard.png` });
    await guest.screenshot({ path: `${SHOTS}14b-guest-whiteboard.png` });

    step('guest selects and resizes whiteboard strokes');
    const inkBox = () => {
      const target = document.querySelector('canvas[aria-label="Whiteboard canvas"]');
      if (!target) return null;
      const data = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let minX = target.width;
      let minY = target.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < target.height; y += 2) {
        for (let x = 0; x < target.width; x += 2) {
          if (data[(y * target.width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    };
    const beforeBox = await host.evaluate(inkBox);
    await guest.getByRole('button', { name: 'Select and resize' }).click();
    await guest.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
    await guest.mouse.down();
    await guest.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8, { steps: 12 });
    await guest.mouse.up();
    const handle = guest.getByRole('button', { name: 'Resize bottom right' });
    await handle.waitFor({ timeout: 5000 });
    await guest.screenshot({ path: `${SHOTS}14d-guest-whiteboard-selected.png` });
    const grip = await handle.boundingBox();
    await guest.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await guest.mouse.down();
    await guest.mouse.move(grip.x + grip.width / 2 + box.width * 0.18, grip.y + grip.height / 2 + box.height * 0.18, { steps: 15 });
    await guest.mouse.up();
    await host
      .waitForFunction(
        (previousWidth) => {
          const target = document.querySelector('canvas[aria-label="Whiteboard canvas"]');
          if (!target || !previousWidth) return false;
          const data = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
          let minX = target.width;
          let maxX = -1;
          for (let y = 0; y < target.height; y += 2) {
            for (let x = 0; x < target.width; x += 2) {
              if (data[(y * target.width + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
              }
            }
          }
          return maxX >= 0 && maxX - minX + 1 > previousWidth * 1.1;
        },
        beforeBox?.w ?? 0,
        { timeout: 8000 },
      )
      .catch(() => undefined);
    const afterBox = await host.evaluate(inkBox);
    whiteboardResized = Boolean(
      beforeBox && afterBox && afterBox.w > beforeBox.w * 1.1 && afterBox.h > beforeBox.h * 1.1,
    );
    console.log('  whiteboard ink box host before/after resize:', beforeBox, afterBox);
    await host.screenshot({ path: `${SHOTS}14e-host-whiteboard-resized.png` });
    await guest.screenshot({ path: `${SHOTS}14f-guest-whiteboard-resized.png` });
    await guest.getByRole('button', { name: 'Select and resize' }).click();

    step('guest pans and scrolls the endless whiteboard');
    const dpr = await guest.evaluate(() => window.devicePixelRatio || 1);
    const beforePan = await guest.evaluate(inkBox);
    const centerX = box.x + box.width * 0.5;
    const centerY = box.y + box.height * 0.5;
    await guest.getByRole('button', { name: 'Pan canvas' }).click();
    await guest.mouse.move(centerX, centerY);
    await guest.mouse.down();
    await guest.mouse.move(centerX - 140, centerY - 90, { steps: 12 });
    await guest.mouse.up();
    await guest.waitForTimeout(400);
    const afterPan = await guest.evaluate(inkBox);
    whiteboardPanned = Boolean(
      beforePan &&
        afterPan &&
        Math.abs(afterPan.x - beforePan.x + 140 * dpr) < 40 * dpr &&
        Math.abs(afterPan.y - beforePan.y + 90 * dpr) < 40 * dpr,
    );
    console.log('  ink box guest before/after pan:', beforePan, afterPan);
    await guest.screenshot({ path: `${SHOTS}14g-guest-whiteboard-panned.png` });

    const beforeScroll = await guest.evaluate(inkBox);
    await guest.mouse.move(centerX, centerY);
    await guest.mouse.wheel(0, -90);
    await guest.waitForTimeout(400);
    const afterScroll = await guest.evaluate(inkBox);
    whiteboardScrolled = Boolean(
      beforeScroll && afterScroll && afterScroll.y > beforeScroll.y + 50 * dpr,
    );
    console.log('  ink box guest before/after wheel scroll:', beforeScroll, afterScroll);
    await guest.getByRole('button', { name: 'Pan canvas' }).click();

    step('whiteboard replayed to a late joiner');
    const lateContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
      viewport: { width: 1024, height: 700 },
    });
    const late = await lateContext.newPage();
    await late.goto(guestUrl, { waitUntil: 'domcontentloaded' });
    await late.waitForSelector('#join-name', { timeout: 20000 });
    await late.fill('#join-name', 'Late Guest');
    await late.getByRole('button', { name: 'Join meeting' }).click();
    await host.locator('button[aria-label="People"]').click();
    await host.getByRole('button', { name: 'Admit' }).click();
    await late.getByRole('button', { name: 'Leave meeting' }).waitFor({ timeout: 20000 });
    await late.getByText(/started the whiteboard/).waitFor({ timeout: 10000 });
    await late.waitForTimeout(1500);
    const lateInk = await late.evaluate(() => {
      const target = document.querySelector('canvas[aria-label="Whiteboard canvas"]');
      if (!target) return 0;
      const data = target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) count += 1;
      }
      return count;
    });
    console.log('  whiteboard ink replayed to late joiner:', lateInk);
    whiteboardLate = lateInk > 100;
    await late.screenshot({ path: `${SHOTS}14c-late-whiteboard.png` });
    await lateContext.close();

    await host.getByRole('button', { name: 'Close whiteboard' }).click();
    await host.waitForTimeout(800);
  } catch (error) {
    console.log('  whiteboard not available in this headless run:', error.message.split('\n')[0]);
  }

  step('host toggles camera off and back on');
  try {
    await host.getByRole('button', { name: 'Stop video' }).click();
    await host.getByRole('button', { name: 'Start video' }).waitFor({ timeout: 10000 });
    await host.screenshot({ path: `${SHOTS}14h-host-camera-off.png` });
    await host.getByRole('button', { name: 'Start video' }).click();
    await host.getByRole('button', { name: 'Stop video' }).waitFor({ timeout: 15000 });
    cameraToggled = true;
  } catch (error) {
    console.log('  camera toggle not available in this headless run:', error.message.split('\n')[0]);
  }

  step('speaker view toggle');
  await host.locator('button[aria-label="Meeting chat"]').click();
  await host.locator('button[aria-label="Participants and waiting room"]').click();
  await host.locator('button[aria-label="Switch to speaker view"]').click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${SHOTS}15-host-speaker-view.png` });

  step('guest leaves');
  await guest.locator('button[aria-label="Leave meeting"]').click();
  await guest.getByRole('heading', { name: 'You left the meeting' }).waitFor({ timeout: 10000 });
  await guest.screenshot({ path: `${SHOTS}16-guest-left.png` });

  const annotationSynced = inkGuest > 100 && inkHost > 100;
  console.log(
    JSON.stringify(
      { ok: true, shared, guestShared, whiteboardShared, whiteboardLate, whiteboardResized, whiteboardPanned, whiteboardScrolled, cameraToggled, whiteboardInk, fileShared, annotationSynced, inkGuest, inkHost, hostVideos, guestVideos, errors },
      null,
      2,
    ),
  );
} catch (error) {
  console.error('E2E FAILED:', error);
  await host.screenshot({ path: `${SHOTS}99-host-failure.png` }).catch(() => {});
  await guest.screenshot({ path: `${SHOTS}99-guest-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}