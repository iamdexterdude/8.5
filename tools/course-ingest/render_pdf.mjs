// Render course.html to PDF with Edge (Playwright), twice: the first pass finds the page of every topic marker, the second has the contents filled in.
//   node render_pdf.mjs <buildDir> <out.pdf>
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const [buildDir, out] = process.argv.slice(2);
const html = resolve(buildDir, "course.html");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: `<div style="font-family:'Segoe UI',sans-serif;font-size:7.5pt;color:#6B7488;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>IELTS Speaking · the merged course</span><span></span></div>`,
  footerTemplate: `<div style="font-family:'Segoe UI',sans-serif;font-size:8pt;color:#6B7488;width:100%;padding:0 16mm;text-align:center"><span class="pageNumber"></span></div>`,
  margin: { top: "17mm", bottom: "18mm", left: "16mm", right: "16mm" } });
await browser.close();
console.log("rendered", out);
