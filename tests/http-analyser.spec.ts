import { expect, test } from '@playwright/test';
import { GuardResultBulk, Tyr } from '@xtitusx/type-guard';

import { HTTP_ANALYSER_CONFIG } from './http-analyser-config.const';
import { HttpAnalyser } from './http-analyser/http-analyser';
import { HttpCycle } from './http-analyser/http-cycle';
import { HttpRequest } from './http-analyser/http-request';
import { HttpResponse } from './http-analyser/http-response';
import { HttpScheme } from './http-analyser/types';

let httpAnalyser: HttpAnalyser;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    const guardResult = new GuardResultBulk()
        .add([
            ...HTTP_ANALYSER_CONFIG.urls.map((url, index) => {
                return Tyr.string()
                    .matches(new RegExp('^http[s]?://[^ ]*$'))
                    .guard(url, `URL_ANALYSER_CONFIG.urls[${index}]`);
            }),
        ])
        .combine();

    expect(guardResult.isSuccess(), guardResult.getMessage()).toBe(true);
});

test.beforeEach(async ({}, testInfo) => {
    console.log(`Running ${testInfo.title}`);
    httpAnalyser = new HttpAnalyser(testInfo.title.substring(testInfo.title.indexOf(': ') + 2));
});

test.afterEach(async ({ page }) => {
    console.log(`HttpRequestCount: ${httpAnalyser.getHttpRequestCount()}`);
    console.log(`HttpSuccessResponseCount: ${httpAnalyser.getHttpSuccessResponseCount()}`);
    console.log(`HttpErrorResponseCount: ${httpAnalyser.getHttpErrorResponseCount()}`);
    console.log(JSON.parse(JSON.stringify(httpAnalyser)));
    await page.close();
});

for (const url of new Set(HTTP_ANALYSER_CONFIG.urls)) {
    test(`test with URL: ${url}`, async ({ page }) => {
        // page.on('request') is not capturing favicon.ico URI: https://github.com/microsoft/playwright/issues/7493
        page.on('request', async (request) => {
            console.log('>>', request.method(), request.url());

            const httpRequest = new HttpRequest(request, (await request.headerValue(':scheme')) as HttpScheme);

            if (httpAnalyser.getHttpCycles().has(request.url())) {
                httpAnalyser.getHttpCycles().get(request.url())?.setHttpRequest(httpRequest);
            } else {
                httpAnalyser.getHttpCycles().set(request.url(), new HttpCycle(httpRequest, null));
            }
        });

        page.on('response', (response) => {
            console.log('<<', response.status(), response.url());

            httpAnalyser.incrementHttpResponseCount(response.status());

            const httpResponse = new HttpResponse(response);

            if (httpAnalyser.getHttpCycles().has(response.url())) {
                httpAnalyser.getHttpCycles().get(response.url())?.setHttpResponse(httpResponse);
            } else {
                httpAnalyser.getHttpCycles().set(response.url(), new HttpCycle(null, httpResponse));
            }
        });

        await page.goto(url, { waitUntil: 'networkidle' });
    });
}
