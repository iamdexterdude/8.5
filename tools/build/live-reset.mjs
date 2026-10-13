import { chromium } from "playwright";
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await (await b.newContext()).newPage();
await p.goto("https://iamdexterdude.github.io/8.5/reset.html"); await p.waitForTimeout(4000);
console.log(await p.innerText("#diag"));
await b.close();
