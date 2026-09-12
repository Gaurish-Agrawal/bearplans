const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const origin = process.env.BEARPLANS_TEST_URL || 'http://127.0.0.1:5011';
const artifacts = path.resolve(__dirname, '../artifacts/dark-mode');
fs.mkdirSync(artifacts, { recursive: true });

const courses = [
  { courseCode: 'CSE 1310', courseName: 'Introduction to Computer Science', sections: [
    { section: '01', academicPeriod: 'Fall 2026', days: 'Mon/Wed', startTime: '10 AM', endTime: '11:20 AM', instructor: 'Ada Lovelace' },
    { section: '02', academicPeriod: 'Fall 2026', days: 'Tue/Thu', startTime: '10 AM', endTime: '11:20 AM', instructor: 'Grace Hopper' },
  ] },
  { courseCode: 'CHEM 2501', courseName: 'Organic Chemistry I', sections: [
    { section: '01', academicPeriod: 'Fall 2026', days: 'Mon/Wed', startTime: '1 PM', endTime: '2:20 PM' },
    { section: '02', academicPeriod: 'Fall 2026', days: 'Tue/Thu', startTime: '1 PM', endTime: '2:20 PM' },
  ] },
];
const report = { checks: [], screenshots: [] };

async function expectTheme(page, theme) {
  await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
  assert.equal(await page.getByRole('button', { name: 'Dark mode', exact: true }).getAttribute('aria-pressed'), String(theme === 'dark'));
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme);
}
async function setTheme(page, theme) {
  if (await page.locator('html').getAttribute('data-theme') !== theme) {
    await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  }
  await expectTheme(page, theme);
  await page.mouse.move(0, 0);
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true, animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
  if (await page.locator('html').getAttribute('data-theme') === 'dark') await contrast(page);
}
async function contrast(page) {
  const failures = await page.evaluate(() => {
    const rgb = color => color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    const luminance = values => values.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
    const failures = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) || el.closest('svg,script,style,button:disabled,[hidden]')) continue;
      let background = [255,255,255], visible = true;
      const chain = [];
      for (let p = el; p; p = p.parentElement) chain.unshift(p);
      for (const p of chain) {
        const s = getComputedStyle(p), rect = p.getBoundingClientRect();
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 || rect.height === 0) visible = false;
        const c = rgb(s.backgroundColor), a = c[3] ?? 1;
        background = background.map((v, i) => c[i] * a + v * (1-a));
      }
      if (!visible) continue;
      const s = getComputedStyle(el), fg = luminance(rgb(s.color)), bg = luminance(background);
      const ratio = (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
      const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 700);
      if (ratio < (large ? 3 : 4.5)) failures.push({ text: el.textContent.trim().slice(0,65), ratio: +ratio.toFixed(2), color: s.color, background });
    }
    return failures;
  });
  assert.deepEqual(failures, [], `Low-contrast dark text at ${page.url()}: ${JSON.stringify(failures)}`);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Page overflow at ${page.url()}`);
}
async function darkSurface(page, selector) {
  const result = await page.locator(selector).first().evaluate(el => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor };
  });
  const rgb = result.background.match(/[\d.]+/g).map(Number);
  assert(rgb.slice(0, 3).every(c => c < 100), `${selector} has a light background: ${JSON.stringify(result)}`);
  assert(result.color.match(/[\d.]+/g).slice(0, 3).every(c => +c > 150), `${selector} has dark text: ${JSON.stringify(result)}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(60000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await expectTheme(page, 'light');
    await setTheme(page, 'dark');
    await page.reload();
    await expectTheme(page, 'dark');

    const other = await context.newPage();
    await other.goto(`${origin}/privacy`);
    await expectTheme(other, 'dark');
    await setTheme(page, 'light');
    await expectTheme(other, 'light');
    await setTheme(other, 'dark');
    await expectTheme(page, 'dark');
    await other.close();
    report.checks.push('Preference persists through reload and navigation, and syncs between tabs');

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const route of ['/', '/extension', '/privacy', '/timeline', '/team', '/render_no_timetable']) {
        await page.goto(origin + route);
        for (const theme of ['dark', 'light']) {
          await setTheme(page, theme);
          await noOverflow(page);
          const toggle = await page.locator('.theme-toggle').boundingBox();
          assert(toggle.x >= 0 && toggle.x + toggle.width <= width);
          assert.equal(await page.locator('.theme-toggle svg:visible').count(), 1);
          if (theme === 'dark') await darkSurface(page, 'body');
          await shot(page, `${route.replaceAll('/', '') || 'home'}-${theme}-${width}`);
        }
      }
    }
    report.checks.push('All public pages in both themes at desktop, 390px and 320px; no page overflow');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin);
    await setTheme(page, 'dark');
    await page.locator('#section0').getByRole('button', { name: 'Saved Schedules', exact: true }).click();
    await darkSurface(page, '#savedSchedulesPopup');
    await shot(page, 'saved-empty-dark');
    await page.locator('#savedSchedulesPopup').getByRole('button', { name: 'Close' }).click();
    await page.locator('#nextBtnSchool').click();
    await page.locator('#section1').waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('.ts-control input').fill('Chem');
    await page.locator('.ts-dropdown .option').first().waitFor();
    await darkSurface(page, '.ts-dropdown');
    await shot(page, 'course-search-dark');
    await page.locator('.ts-dropdown .option').first().click();
    await page.locator('#section1').getByRole('button', { name: 'Next', exact: false }).click();
    await page.locator('.professor-course').first().waitFor();
    await darkSurface(page, '.professor-course');
    if (await page.locator('.professor-actions').count()) {
      const first = page.locator('.professor-course').first();
      await first.getByRole('button', { name: 'Clear', exact: true }).click();
      assert.equal(await first.locator('input:checked').count(), 0);
      await first.getByRole('button', { name: 'Select all' }).click();
      assert(await first.locator('input:checked').count() > 0);
    }
    await shot(page, 'professors-dark');
    await page.locator('#section2').getByRole('button', { name: 'Next' }).click();
    await page.locator('#section3').getByRole('button', { name: 'Add Time' }).click();
    await darkSurface(page, '.time-range-input');
    await shot(page, 'time-preferences-dark');
    await page.locator('#section3').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.locator('#section3').getByRole('button', { name: 'Next' }).click();
    await shot(page, 'generate-dark');
    await page.locator('#generateScheduleBtn').click();
    await page.waitForURL(/render_(?:no_)?timetable/);
    await expectTheme(page, 'dark');
    report.checks.push('Real course search, professor selection, time preferences, schedule generation');

    const response = await context.request.post(`${origin}/api/workday/generate`, { data: { courses, maxnumber: 10 } });
    assert(response.ok());
    const data = await response.json();
    assert.equal(data.scheduleCount, 4);
    const timetable = origin + data.redirect;
    await page.goto(timetable);
    const active = page.locator('.mySlides:visible');
    const schedules = await page.locator('#workday-export-schedules').evaluate(el => JSON.parse(el.textContent));
    const original = await page.locator('#workday-export-schedules').textContent();
    for (const theme of ['dark', 'light']) {
      await setTheme(page, theme);
      const block = active.locator('.course-block').first();
      if (theme === 'dark') {
        await darkSurface(page, '.mySlides:visible .course-block');
        for (const color of await active.locator('.course-block').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))) {
          const [r,g,b] = color.match(/\d+/g).map(Number);
          assert.equal(r,g); assert.equal(g,b);
        }
      }
      await shot(page, `schedule-${theme}-desktop`);
      await block.click();
      assert.equal(await block.getAttribute('aria-expanded'), 'true');
      if (theme === 'dark') await darkSurface(page, '.mySlides:visible .course-details');
      await shot(page, `course-details-${theme}`);
      await page.keyboard.press('Escape');
      await active.getByRole('button', { name: 'Split', exact: true }).click();
      await shot(page, `split-dialog-${theme}`);
      const second = page.locator('#splitNumberGrid').getByRole('button', { name: '2', exact: true });
      if (!(await second.getAttribute('class')).includes('active')) await second.click();
      await page.getByRole('button', { name: 'View Selected' }).click();
      assert.equal(await page.locator('.split-card').count(), 2);
      await shot(page, `split-view-${theme}`);
      await page.getByRole('link', { name: 'Exit Split' }).click();
      await active.getByRole('button', { name: 'Compare with Friends' }).click();
      if (theme === 'dark') await darkSurface(page, '#friendCodeInput');
      await shot(page, `compare-${theme}`);
      await page.locator('#helpBtn').click();
      await shot(page, `help-${theme}`);
      await page.locator('#helpPopup').getByRole('button', { name: 'Close' }).click();
      await page.locator('#comparePopup').getByRole('button', { name: 'Close' }).click();
      await active.getByRole('button', { name: 'Add to Workday', exact: true }).click();
      if (theme === 'dark') {
        await darkSurface(page, '.workday-export-dialog');
        await darkSurface(page, '#workday-schedule-name');
      }
      await page.locator('#workday-schedule-name').fill('Theme test (not submitted)');
      await shot(page, `workday-dialog-${theme}`);
      await page.locator('.workday-export-dialog').getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await page.locator('#workday-export-schedules').textContent(), original);
    }
    report.checks.push('All four generated combinations unchanged by toggles; grayscale blocks, expanded details, split, compare, help and site Workday dialog in both themes');

    await setTheme(page, 'dark');
    page.once('dialog', d => d.accept('Theme regression schedule'));
    await active.getByRole('button', { name: 'Save', exact: true }).click();
    await page.goto(origin);
    await page.locator('#section0').getByRole('button', { name: 'Saved Schedules', exact: true }).click();
    await page.getByText('Theme regression schedule', { exact: true }).waitFor();
    await shot(page, 'saved-schedules-dark');
    await page.locator('#savedSchedulesPopup').getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('heading', { name: 'Saved Schedule 1/1' }).waitFor();
    await expectTheme(page, 'dark');
    await shot(page, 'saved-schedule-dark');
    for (const source of ['shared', 'saved']) {
      const saved = await context.request.post(`${origin}/set_matched_schedule`, { data: {
        matchedSchedule: schedules, source, friendMatchedSchedule: 1, overlappingCourses: Object.keys(schedules[0])
      } });
      assert(saved.ok());
      for (const route of source === 'shared' ? ['/render_timetable_check', '/render_timetable2'] : ['/render_timetable_check']) {
        await page.goto(origin + route);
        for (const theme of ['dark', 'light']) {
          await setTheme(page, theme);
          await shot(page, `${source}-${route.includes('2') ? 'matched' : 'view'}-${theme}`);
        }
      }
    }
    report.checks.push('Save and reload schedule, shared and friend-matched render paths');

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(timetable);
      for (const theme of ['dark', 'light']) {
        await setTheme(page, theme);
        await noOverflow(page);
        await shot(page, `schedule-${theme}-${width}`);
      }
      await page.goto(origin);
      await page.locator('#nextBtnSchool').click();
      await page.locator('#section1').waitFor({ state: 'visible' });
      await page.locator('.ts-control input').fill('Chem');
      await page.locator('.ts-dropdown .option').first().click();
      for (const section of [1, 2, 3, 4]) {
        if (section === 2) await page.locator('.professor-course').first().waitFor();
        if (section === 3) await page.locator('#section3').getByRole('button', { name: 'Add Time' }).click();
        for (const theme of ['dark', 'light']) {
          await setTheme(page, theme);
          await noOverflow(page);
          await shot(page, `step-${section}-${theme}-${width}`);
        }
        if (section < 4) await page.locator(`#section${section}`).getByRole('button', { name: 'Next' }).click();
      }
    }
    assert.deepEqual(errors, []);
    await context.close();

    for (const mode of ['invalid', 'blocked', 'write-blocked']) {
      const c = await browser.newContext();
      await c.addInitScript(mode => {
        if (mode === 'invalid') localStorage.setItem('bearPlansTheme', 'unexpected');
        else if (mode === 'blocked') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
        else Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
      }, mode);
      const p = await c.newPage();
      const themeErrors = [];
      p.on('pageerror', e => themeErrors.push(e.message));
      await p.goto(origin);
      await expectTheme(p, 'light');
      await setTheme(p, 'dark');
      await setTheme(p, 'light');
      await setTheme(p, 'dark');
      assert.deepEqual(themeErrors, []);
      await c.close();
    }
    report.checks.push('Invalid stored values, unavailable localStorage and write failures do not break toggling');
    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const rp = await reduced.newPage();
    await rp.goto(origin);
    await rp.getByRole('button', { name: 'Dark mode' }).focus();
    await rp.keyboard.press('Space');
    await expectTheme(rp, 'dark');
    assert.equal(await rp.locator('.theme-toggle').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await reduced.close();
    report.checks.push('Keyboard operation and reduced-motion preference');
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
