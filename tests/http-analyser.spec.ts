import util from 'util';
import { expect, test } from '@playwright/test';
import { GuardResultBulk, Tyr } from '@xtitusx/type-guard';

import { HTTP_ANALYSER_CONFIG } from './http-analyser/config/http-analyser-config.const';
import { HttpAnalyser } from './http-analyser/http-analyser';
import { SerializerFactory } from './http-analyser/serializer/serializer.factory';
import { Serializer } from './http-analyser/serializer/serializer';
import { HttpAnalyserFacade } from './http-analyser/http-analyser.facade';
import { Viewport } from './http-analyser/dictionaries/viewport.enum';

let serializer: Serializer;
let httpAnalyser: HttpAnalyser;

test.describe.configure({ mode: 'serial' });
test.use({ viewport: HTTP_ANALYSER_CONFIG.viewport });

test.beforeAll(async ({}, testInfo) => {
    let guardResult = new GuardResultBulk()
        .add([
            Tyr.number().isWhole().isBetween(1024, 2048).guard(HTTP_ANALYSER_CONFIG.viewport.width),
            Tyr.number().isWhole().isBetween(720, 1536).guard(HTTP_ANALYSER_CONFIG.viewport.height),
            Tyr.string()
                .isIn(Object.values(Viewport))
                .guard(
                    `${HTTP_ANALYSER_CONFIG.viewport.width.toString()}x${HTTP_ANALYSER_CONFIG.viewport.height.toString()}`,
                    'viewport'
                ),
        ])
        .combine();

    expect(guardResult.isSuccess(), guardResult.getMessage()).toBe(true);

    guardResult = new GuardResultBulk()
        .add([
            ...HTTP_ANALYSER_CONFIG.urls.map((url, index) => {
                return Tyr.string()
                    .matches(new RegExp('^http[s]?://[^ ]*$'))
                    .guard(url, `URL_ANALYSER_CONFIG.urls[${index}]`);
            }),
        ])
        .combine();

    expect(guardResult.isSuccess(), guardResult.getMessage()).toBe(true);

    serializer = SerializerFactory.getInstance().create(HTTP_ANALYSER_CONFIG.serializer.type);

    if (HTTP_ANALYSER_CONFIG.serializer.clean === true && testInfo.workerIndex === 0) {
        await serializer.clean();
    }
});

test.beforeEach(async ({ page }, testInfo) => {
    console.log(`Running ${testInfo.title}`);

    httpAnalyser = await new HttpAnalyserFacade(page, testInfo).createHttpAnalyser();
});

test.afterEach(async ({ page }) => {
    httpAnalyser.refreshAndGetAggregation();

    console.log(util.inspect(httpAnalyser, { showHidden: false, depth: null, colors: true }));

    serializer.serialize(httpAnalyser);

    await page.close();
});

for (const url of new Set(HTTP_ANALYSER_CONFIG.urls)) {
    test(`test with URL: ${url}`, async ({ page }) => {
        // https://playwright.dev/docs/api/class-request
        // page.on('request') is not capturing favicon.ico URI: https://github.com/microsoft/playwright/issues/7493
        page.on('request', async (request) => {
            console.log('>>', request.method(), request.url());

            await httpAnalyser.parseHttpMessage(request);
        });

        page.on('response', (response) => {
            console.log('<<', response.status(), response.url());

            httpAnalyser.parseHttpMessage(response);
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        httpAnalyser.setNavigationTimings(await page.evaluate(() => performance.getEntriesByType('navigation')));
        httpAnalyser.setResourceTimings(await page.evaluate(() => window.performance.getEntriesByType('resource')));
    });
}
