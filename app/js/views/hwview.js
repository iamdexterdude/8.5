// The homework on Today: tasks, each a list of steps. She does them one by one; a finished step collapses and the next opens.
import { h, icon } from "../util.js";
import * as hw from "../homework.js";
import { stepBody, STEP_LABEL } from "./hwsteps.js";

let openTask = null;          // task opened by hand
const peek = new Set();       // finished steps she reopened to look at
let scrollNext = false;

export function homeworkSection(date, homework) {
  const cur = hw.currentStep(date, homework);
  const p = hw.dayProgress(date, homework);
  const sec = h("section", { class: "section hw", "aria-label": "Today's homework" },
    h("div", { class: "shead" }, h("h2", null, "Homework"), h("span", { class: "kicker num" }, p.complete ? "All done" : `${p.tasksDone} of ${p.tasks} tasks`)));
  const advance = () => { scrollNext = true; openTask = null; };

  for (const task of homework.tasks) {
    const tp = hw.taskProgress(date, task);
    const isCurrentTask = cur?.task.id === task.id;
    const open = openTask ? openTask === task.id : isCurrentTask;
    const head = h("button", { class: "hwhead", "aria-expanded": String(open), onclick: () => { openTask = open ? "__none__" : task.id; document.dispatchEvent(new CustomEvent("hw-rerender")); } },
      h("span", { class: "hwmark" + (tp.complete ? " done" : "") }, tp.complete ? icon("check", 18) : String(homework.tasks.indexOf(task) + 1)),
      h("span", { class: "grow" }, h("b", null, task.title), h("span", { class: "sub" }, [task.summary, task.minutes ? `about ${task.minutes >= 90 ? (task.minutes / 60).toFixed(1).replace(".0", "") + " h" : task.minutes + " min"}` : null].filter(Boolean).join(", "))),
      h("span", { class: "hwcount num" }, `${tp.done}/${tp.total}`));
    const card = h("div", { class: "hwtask" + (open ? " open" : "") + (tp.complete ? " complete" : "") }, head);
    if (open) {
      const list = h("ol", { class: "steps" });
      task.steps.forEach((step, i) => {
        const done = hw.stepDone(date, step.id), isCur = isCurrentTask && cur.step.id === step.id;
        const showBody = isCur || (done && peek.has(step.id));
        const li = h("li", { class: "hwstep" + (done ? " done" : "") + (isCur ? " current" : ""), id: "step-" + step.id },
          h("button", { class: "steptitle", "aria-expanded": String(showBody), disabled: !done && !isCur, onclick: () => { if (!done) return; peek.has(step.id) ? peek.delete(step.id) : peek.add(step.id); document.dispatchEvent(new CustomEvent("hw-rerender")); } },
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
