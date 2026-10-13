// #/join/<code>: the link the teacher sends. It saves the class code on this device and opens Today.
import { h } from "../util.js";
import * as hw from "../homework.js";
import { toast } from "../ui.js";

export const live = false;
export default async function (ctx) {
  const code = decodeURIComponent(ctx.params[0] || "");
  if (code) { await hw.setClassCode(code); toast("Connected. Your homework will appear on Today."); }
  location.replace("#/today");
  return h("div");
}
