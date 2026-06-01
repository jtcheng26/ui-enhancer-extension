import { sanitizeOuterHtmlSnapshot } from "@/services/dom-inspection-service";
import "../../assets/tailwind.css";

import { initializeContentPrototype } from "../content/bootstrap";
const uh =
  '{"root":{"selector":"#right-side-wrapper","required":true,"output":"RightSidebar"},"types":{"RightSidebar":{"todoHeader":"string","todos":"array","hasTodos":"boolean","showAllLabel":"string","recentFeedbackHeader":"string","hasRecentFeedback":"boolean","recentFeedbackEmpty":"boolean","newCourseCtaLabel":"string","newCourseModalExists":"boolean","viewGradesHref":"string","viewGradesLabel":"string"},"TodoItem":{"title":"string","dueText":"string","assignmentTitle":"string","assignmentPoints":"string","assignmentTimeText":"string","dismissLabel":"string"},"RecentFeedbackEmptyItem":{"text":"string"}},"extractors":{"RightSidebar":{"todoHeader":{"type":"string"},"todos":{"type":"array","items":"TodoItem"},"hasTodos":{"type":"boolean"},"showAllLabel":{"type":"string"},"recentFeedbackHeader":{"type":"string"},"hasRecentFeedback":{"type":"boolean"},"recentFeedbackEmpty":{"type":"boolean"},"newCourseCtaLabel":{"type":"string"},"newCourseModalExists":{"type":"boolean"},"viewGradesHref":{"type":"string"},"viewGradesLabel":{"type":"string"}},"TodoItem":{"title":{"type":"string","nullable":true},"dueText":{"type":"string","nullable":true},"assignmentTitle":{"type":"string","nullable":true},"assignmentPoints":{"type":"string","nullable":true},"assignmentTimeText":{"type":"string","nullable":true},"dismissLabel":{"type":"string","nullable":true}},"RightSidebar_placeholder":{"__unused":{}}}}';
export default defineContentScript({
  cssInjectionMode: "ui",
  matches: ["<all_urls>"],
  main(ctx) {
    // setTimeout(() => {
    //   console.log(
    //     "HTML SNAPSHOT SIZE",
    //     sanitizeOuterHtmlSnapshot(document.body),
    //   );
    // }, 5000);
    void initializeContentPrototype(ctx);
  },
});
