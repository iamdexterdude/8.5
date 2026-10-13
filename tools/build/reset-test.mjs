import { chromium } from "playwright";
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await (await b.newContext()).newPage();
await p.goto("http://127.0.0.1:8123/?nowelcome#/today"); await p.waitForTimeout(2500);
await p.goto("http://127.0.0.1:8123/reset.html"); await p.waitForTimeout(3500);
console.log((await p.innerText("#diag")).split("\n").map((l) => "  " + l).join("\n"));
await p.click("#refresh"); await p.waitForTimeout(3500);
console.log("after Refresh:", p.url().replace(/\?r=\d+/, "?r=…"), "| page shows:", JSON.stringify((await p.innerText("main#view")).slice(0, 60)));
await b.close();
