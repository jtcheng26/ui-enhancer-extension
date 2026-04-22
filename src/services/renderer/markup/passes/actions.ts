import { ClickActionValue, matchesFilter } from "@/services/dom-extractor";
import { Visitor } from "../markup-renderer";
import { resolvePath } from "./shared";

export const applyActions: Visitor = (root, data) => {
  const slotPattern = `\\{\\{(data\\.[\\.\\w\\[\\]]+)?\\}\\}`;

  const actionEls = [
    ...root.querySelectorAll<HTMLElement>("[data-action]"),
  ].reverse();

  for (const el of actionEls) {
    const actionSlot = el.dataset.action!;

    const actionPath = actionSlot.match(slotPattern)?.[1];
    if (!actionPath) continue;

    const maybeAction = resolvePath(data, actionPath);
    if (
      !maybeAction ||
      typeof maybeAction !== "object" ||
      !("type" in maybeAction) ||
      maybeAction.type !== "clickAction"
    )
      continue;

    el.removeAttribute("data-action");

    const action = maybeAction as ClickActionValue;

    const element = Array.from(document.querySelectorAll(action.selector))
      .filter(
        (candidate) =>
          !action.filter || matchesFilter(candidate, action.filter),
      )
      .find(
        (candidate) =>
          candidate.tagName === "BUTTON" || candidate.tagName === "A",
      );
    if (!element) continue;

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Clicking", el, element, action);
      element.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
  }

  return root;
};
