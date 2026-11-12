// The homework on Today: tasks, each a list of steps. She does them one by one; a finished step collapses and the next opens.
import { h, icon } from "../util.js";
import * as hw from "../homework.js";
import { stepBody, STEP_LABEL } from "./hwsteps.js";

let openTask = null;          // task opened by hand
const peek = new Set();       // finished steps she reopened to look at
let scrollNext = false;
export const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export function homeworkSection(date, homework) {
  const cur = hw.currentStep(date, homework);
  const p = hw.dayProgress(date, homework);
  const sec = h("section", { class: "section hw", "aria-label": "Today's homework" },
    );
  const advance = () => { scrollNext = true; openTask = null; };

  for (const task of homework.tasks) {
    const tp = hw.taskProgress(date, task);
    const isCurrentTask = cur?.task.id === task.id;
    const open = openTask ? openTask === task.id : isCurrentTask;
    const head = h("button", { class: "hwhead", "aria-expanded": String(open), onclick: () => { openTask = open ? "__none__" : task.id; document.dispatchEvent(new CustomEvent("hw-rerender")); } },
      h("span", { class: "hwmark" + (tp.complete ? " done" : "") }, tp.complete ? icon("check", 18) : String(homework.tasks.indexOf(task) + 1)),
      h("span", { class: "grow" }, h("b", null, task.title), task.summary ? h("span", { class: "sub" }, task.summary) : null),
      h("span", { class: "hwcount num" }, tp.total > 1 ? `${tp.done}/${tp.total}` : task.minutes ? dur(task.minutes) : ""));
    const card = h("div", { class: "hwtask" + (open ? " open" : "") + (tp.complete ? " complete" : "") }, head);
    const solo = task.steps.length === 1 && (task.steps[0].type === "speaking" || task.steps[0].type === "reading");
    if (open && solo) card.append(h("div", { class: "hwsolo" }, stepBody({ date, hw: homework, task, step: task.steps[0], advance })));
    else if (open) {
      const list = h("ol", { class: "steps" });
      task.steps.forEach((step, i) => {
        const done = hw.stepDone(date, step.id), isCur = isCurrentTask && cur.step.id === step.id;
        const roomy = step.type === "speaking" || step.type === "reading";   // these open any time, in any order
        const showBody = isCur || roomy || (done && peek.has(step.id));
        const li = h("li", { class: "hwstep" + (done ? " done" : "") + (isCur ? " current" : ""), id: "step-" + step.id },
          h("button", { class: "steptitle", "aria-expanded": String(showBody), disabled: !done && !isCur && !roomy, onclick: () => { if (!done) return; peek.has(step.id) ? peek.delete(step.id) : peek.add(step.id); document.dispatchEvent(new CustomEvent("hw-rerender")); } },
            h("span", { class: "smark" }, done ? icon("check", 16) : String(i + 1)), h("span", { class: "grow" }, step.title || STEP_LABEL[step.type]), done ? h("span", { class: "tiny faint" }, hw.stateOf(date).steps[step.id]?.data?.sent === "queued" ? "Saved, sends when online" : "Done") : null),
          showBody ? h("div", { class: "stepbody" }, stepBody({ date, hw: homework, task, step, advance })) : null);
        list.append(li);
      });
      card.append(list);
    }
    sec.append(card);
  }
  if (scrollNext) { scrollNext = false; requestAnimationFrame(() => document.querySelector(".hwstep.current")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })); }
  return sec;
}
