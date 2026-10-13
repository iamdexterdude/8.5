// Photos of handwritten pages -> PDF, made on her device (no libraries, no upload).
// Pages are JPEG at a sensible size. If the whole thing would be too large to send in one go, it is split into parts.
async function toJpeg(file, maxSide = 1600, quality = 0.76) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { bmp = await createImageBitmap(file); }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("This photo could not be read.");
  return { w, h, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function buildPdf(imgs) {
  const enc = new TextEncoder(), parts = [], offsets = []; let pos = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };
  const pageIds = imgs.map((_, i) => 3 + i * 3);                 // page, image, content for each picture
  push("%PDF-1.4\n%âãÏÓ\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((i) => i + " 0 R").join(" ")}] /Count ${imgs.length} >>`);
  imgs.forEach((im, i) => {
    const p = 3 + i * 3, W = 595, H = 842, M = 24, k = Math.min((W - 2 * M) / im.w, (H - 2 * M) / im.h), dw = (im.w * k).toFixed(1), dh = (im.h * k).toFixed(1);
    const x = ((W - im.w * k) / 2).toFixed(1), y = ((H - im.h * k) / 2).toFixed(1);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
    offsets[p + 1] = pos; push(`${p + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push("\nendstream\nendobj\n");
    const content = `q ${dw} 0 0 ${dh} ${x} ${y} cm /Im0 Do Q`;
    obj(p + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 3 + imgs.length * 3, xref = pos;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(String(offsets[n]).padStart(10, "0") + " 00000 n \n");
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: "application/pdf" });
}

// returns one Blob per part (usually one)
export async function imagesToPdf(files, { maxBytes = 3 * 1024 * 1024 } = {}) {
  const imgs = []; for (const f of files) imgs.push(await toJpeg(f));
  const groups = [[]]; let size = 0;
  for (const im of imgs) {
    if (groups.at(-1).length && size + im.bytes.length > maxBytes) { groups.push([]); size = 0; }
    groups.at(-1).push(im); size += im.bytes.length;
  }
  return groups.map(buildPdf);
}
