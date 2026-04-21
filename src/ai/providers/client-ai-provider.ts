import { AugmentationRequest } from "@/types";
import { AIProvider, UIRequest } from "./ai-provider";
import {
  DOMExtractorSpec,
  DOMExtractorSpecSchema,
  ExtractedValue,
} from "../../services/dom-extractor";
import { z } from "zod";
import { generateText, Output, streamText } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

import extractorPromptSystem from "../prompts/generate-extractor-system.txt?raw";
import extractorPromptUser from "../prompts/generate-extractor-user.txt?raw";
import uiPromptUser from "../prompts/generate-ui-user.txt?raw";
import { jsonRenderSystemPrompt } from "../ui/prompt";

// import Raw from "../prompts/temp.txt?raw";
import { compileSpecStream } from "@json-render/core";

function loadPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

type Shape =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | { type: "array"; items: Shape }
  | { type: "object"; properties: Record<string, Shape> };

function getShape(value: ExtractedValue): Shape {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    if (value.length === 0) {
      // ambiguous → treat as unknown array
      return { type: "array", items: "null" };
    }
    return {
      type: "array",
      items: getShape(value[0]), // assume homogeneous
    };
  }

  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, getShape(v)]),
        ),
      };
    default:
      throw new Error("Unsupported type");
  }
}

export function recordToShapeJSON(
  input: Record<string, ExtractedValue>,
): string {
  const shape = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, getShape(v)]),
  );
  return JSON.stringify(shape, null, 2);
}

export class ClientAIProvider implements AIProvider {
  openai: OpenAIProvider;
  constructor(apiKey: string) {
    this.openai = createOpenAI({
      apiKey,
    });
  }

  async generateJsonRender(input: UIRequest): Promise<string> {
    const dom = JSON.stringify(input.snapshot);
    const data = recordToShapeJSON(input.data);
    const promptUser = loadPrompt(uiPromptUser, {
      // dom,
      data,
      prompt: input.prompt,
    });
    console.log(jsonRenderSystemPrompt);
    console.log(promptUser);
    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        },
      },
      system: jsonRenderSystemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptUser,
            },
            // {
            //   type: "image",
            //   image: input.screenshot,
            // },
          ],
        },
      ],
    });
    const stream = result.text;
    // const stream =
    //   '{"op":"add","path":"/root","value":"main"}\n{"op":"add","path":"/elements/main","value":{"type":"Card","props":{"title":{"$state":"/ui/title"},"description":{"$state":"/ui/description"},"maxWidth":"full"},"children":["page-stack","course-grid"]}}\n{"op":"add","path":"/elements/page-stack","value":{"type":"Stack","props":{"direction":"vertical","gap":"lg","align":"stretch"},"children":["page-heading","page-subheading"]}}\n{"op":"add","path":"/elements/page-heading","value":{"type":"Heading","props":{"text":{"$state":"/ui/title"},"level":"h1"},"children":[]}}\n{"op":"add","path":"/elements/page-subheading","value":{"type":"Heading","props":{"text":{"$state":"/ui/subtitle"},"level":"h3"},"children":[]}}\n{"op":"add","path":"/elements/course-grid","value":{"type":"Stack","props":{"direction":"horizontal","gap":"md","align":"stretch"},"repeat":{"statePath":"/cards","key":"courseUrl"},"children":["course-card"]}}\n{"op":"add","path":"/elements/course-card","value":{"type":"Card","props":{"title":{"$template":"${courseName}"},"description":{"$template":"${courseCode}"},"maxWidth":"md"},"children":["card-top","card-actions"]}}\n{"op":"add","path":"/elements/card-top","value":{"type":"Stack","props":{"direction":"vertical","gap":"sm","align":"stretch"},"children":["card-badge","card-image","card-title","card-code"]}}\n{"op":"add","path":"/elements/card-badge","value":{"type":"Heading","props":{"text":{"$template":"⭐ ${courseName}"},"level":"h4"},"children":[]}}\n{"op":"add","path":"/elements/card-image","value":{"type":"Card","props":{"title":{"$template":"🎨 ${courseName}"},"description":{"$template":"${courseCode}"},"maxWidth":"full"},"children":[]}}\n{"op":"add","path":"/elements/card-title","value":{"type":"Heading","props":{"text":{"$template":"${courseName}"},"level":"h2"},"children":[]}}\n{"op":"add","path":"/elements/card-code","value":{"type":"Heading","props":{"text":{"$template":"${courseCode}"},"level":"h4"},"children":[]}}\n{"op":"add","path":"/elements/card-actions","value":{"type":"Stack","props":{"direction":"horizontal","gap":"sm","align":"stretch","justify":"start"},"children":["action-announcements","action-assignments","action-discussions","action-files"]}}\n{"op":"add","path":"/elements/action-announcements","value":{"type":"Button","props":{"label":{"$template":"📣 Announcements"},"variant":"secondary"},"children":[]}}\n{"op":"add","path":"/elements/action-assignments","value":{"type":"Button","props":{"label":{"$template":"📝 Assignments"},"variant":"secondary"},"children":[]}}\n{"op":"add","path":"/elements/action-discussions","value":{"type":"Button","props":{"label":{"$template":"💬 Discussions"},"variant":"secondary"},"children":[]}}\n{"op":"add","path":"/elements/action-files","value":{"type":"Button","props":{"label":{"$template":"📁 Files"},"variant":"secondary"},"children":[]}}\n{"op":"add","path":"/state/ui","value":{"title":"My Super Fun Classes","subtitle":"Tap a card to open it and see all the colorful learning adventures"}}\n{"op":"add","path":"/state/cards","value":[]}\n{"op":"add","path":"/state/cards/0","value":{"courseName":"Introduction to Psychology","courseCode":"PSYC 101","courseUrl":"/courses/12463798","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/6ecdb601-a2af-478a-91b5-7608112ebaf2/colorful-marketing-brain-psych-mob-1710.jpg?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU5MTcxNzcsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzLzZlY2RiNjAxLWEyYWYtNDc4YS05MWI1LTc2MDgxMTJlYmFmMi9jb2xvcmZ1bC1tYXJrZXRpbmctYnJhaW4tcHN5Y2gtbW9iLTE3MTAuanBnIiwiaG9zdCI6bnVsbCwiZXhwIjoxNzc2NTIxOTc3fQ.fZK09kFejjyMMPllQjxCrLuuDCqbkHfzQRpA7LirXCrQgaE1lgFFnqguea5AqIE5_Ygt6lOa1s7_1sgTxC13MQ&geometry=524x292&format=webp","color":"rgb(183, 67, 12)","actions":[{"actionType":"","actionTitle":"Announcements - Introduction to Psychology","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Assignments - Introduction to Psychology","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - Introduction to Psychology","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - Introduction to Psychology","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for Introduction to Psychology","hasAnnouncementsAction":true,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":4}}\n{"op":"add","path":"/state/cards/1","value":{"courseName":"English Composition","courseCode":"ENGL101","courseUrl":"/courses/12452872","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/79f989cf-cec8-4f61-9313-cc70f565ab97/english-105-college-composition-ii_406355_large.jpeg?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU4ODYxNjMsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzLzc5Zjk4OWNmLWNlYzgtNGY2MS05MzEzLWNjNzBmNTY1YWI5Ny9lbmdsaXNoLTEwNS1jb2xsZWdlLWNvbXBvc2l0aW9uLWlpXzQwNjM1NV9sYXJnZS5qcGVnIiwiaG9zdCI6bnVsbCwiZXhwIjoxNzc2NDkwOTYzfQ.9sa8Lh9Vp9Jxld0YwhXM5IIhZD5k1mNZs6yNONCBCM_knDHYHTOAxEGmpUBpfeelCb_Ley8f2MOKxo01NFOWFA&geometry=524x292&format=webp","color":"rgb(6, 163, 183)","actions":[{"actionType":"","actionTitle":"Announcements - English Test","href":"","badgeCount":"2","hasUnreadBadge":true},{"actionType":"","actionTitle":"Assignments - English Test","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - English Test","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - English Test","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for English Test","hasAnnouncementsAction":true,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":4}}\n{"op":"add","path":"/state/cards/2","value":{"courseName":"Music Theory 1","courseCode":"MUSI101","courseUrl":"/courses/12463780","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/cd1da196-19a1-466d-ba9e-d743bbb5fafc/MUSI101.png?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU4NTg2NzgsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzL2NkMWRhMTk2LTE5YTEtNDY2ZC1iYTllLWQ3NDNiYmI1ZmFmYy9NVVNJMTAxLnBuZyIsImhvc3QiOm51bGwsImV4cCI6MTc3NjQ2MzQ3OH0.XvhN_dRabGXQxGc-373Sym8IwWGdNgPSSwu3bbgVFmDy4MXEZtwDDB4r01x394--w9TWoBYf542xkjd0VVHE0A&geometry=524x292&format=webp","color":"rgb(231, 31, 99)","actions":[{"actionType":"","actionTitle":"Announcements - Music Theory 1","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Assignments - Music Theory 1","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - Music Theory 1","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for Music Theory 1","hasAnnouncementsAction":true,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":false,"actionCount":3}}\n{"op":"add","path":"/state/cards/3","value":{"courseName":"Computer","courseCode":"This_Is_A_Long_Title_Course_Code_COMP101","courseUrl":"/courses/13992955","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/3a9b793f-d908-45cf-9ace-a9e7441dfb2d/computer.jpg?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU3MTkxNzQsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzLzNhOWI3OTNmLWQ5MDgtNDVjZi05YWNlLWE5ZTc0NDFkZmIyZC9jb21wdXRlci5qcGciLCJob3N0IjpudWxsLCJleHAiOjE3NzYzMjM5NzR9.BspFZ7ySd1cm-bVk_sJrSliZxiopQ0jpSvHtw0ZncftVo8Rkmk17by2QpDMrRsCVOQtvbVBcXD4YCXHnpCZvCA&geometry=524x292&format=webp","color":"rgb(173, 71, 105)","actions":[{"actionType":"","actionTitle":"Assignments - Computer","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - Computer","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - Computer","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for Computer","hasAnnouncementsAction":false,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":3}}\n{"op":"add","path":"/state/cards/4","value":{"courseName":"Calculus II","courseCode":"MATH202","courseUrl":"/courses/14050255","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/eac1868f-1eed-4ce5-bcad-82c869885002/MA126.png?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU4MDIzNTAsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzL2VhYzE4NjhmLTFlZWQtNGNlNS1iY2FkLTgyYzg2OTg4NTAwMi9NQTEyNi5wbmciLCJob3N0IjpudWxsLCJleHAiOjE3NzY0MDcxNTB9.0pShWNZbcxj5dzbeVJLJ8VvHckGICyXWBPlvK70rIFOR47zkMTzQX11FnHANf8tcKTLgO8xc7KToalDicgB_yg&geometry=524x292&format=webp","color":"rgb(0, 132, 0)","actions":[{"actionType":"","actionTitle":"Announcements - Calculus II","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Assignments - Calculus II","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - Calculus II","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - Calculus II","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for Calculus II","hasAnnouncementsAction":true,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":4}}\n{"op":"add","path":"/state/cards/5","value":{"courseName":"Biology","courseCode":"BIO101","courseUrl":"/courses/14192559","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/61050524-9cfc-4e4a-b92b-d89435296edf/bio.jpg?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU5MDc0ODksInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzLzYxMDUwNTI0LTljZmMtNGU0YS1iOTJiLWQ4OTQzNTI5NmVkZi9iaW8uanBnIiwiaG9zdCI6bnVsbCwiZXhwIjoxNzc2NTEyMjg5fQ.E9OBAe6mTfAEpaR6SHOsKq27eXdka9WZAu6qtdPLBLAopYq31tiAjz0m9rECea-lo6V2rvuxI2m0xvMRe3VV6w&geometry=524x292&format=webp","color":"rgb(77, 61, 77)","actions":[{"actionType":"","actionTitle":"Assignments - Biology","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - Biology","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - Biology","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for Biology","hasAnnouncementsAction":false,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":3}}\n{"op":"add","path":"/state/cards/6","value":{"courseName":"History","courseCode":"HIST101","courseUrl":"/courses/14190013","cardAriaLabel":null,"imageUrl":"https://inst-fs-iad-prod.inscloudgate.net/files/ef630e98-75cf-4951-a92c-51c78964ada5/history.jpg?download=1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3NzU2ODQwNTgsInVzZXJfaWQiOm51bGwsInJlc291cmNlIjoiL2ZpbGVzL2VmNjMwZTk4LTc1Y2YtNDk1MS1hOTJjLTUxYzc4OTY0YWRhNS9oaXN0b3J5LmpwZyIsImhvc3QiOm51bGwsImV4cCI6MTc3NjI4ODg1OH0.FOLFiflaxjzcFdA01bg_daFl6_8TNMAznS0TX59fgwm2APUQsi-4sJZQ8__wcShHU3w7jLkqzbRNKvwEkyuq2w&geometry=524x292&format=webp","color":"rgb(145, 52, 155)","actions":[{"actionType":"","actionTitle":"Assignments - History","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Discussions - History","href":"","badgeCount":0,"hasUnreadBadge":false},{"actionType":"","actionTitle":"Files - History","href":"","badgeCount":0,"hasUnreadBadge":false}],"moreMenuExpanded":"false","moreMenuButtonLabel":"Choose a color or course nickname or move course card for History","hasAnnouncementsAction":false,"hasAssignmentsAction":true,"hasDiscussionsAction":true,"hasFilesAction":true,"actionCount":3}}';
    // const spec = compileSpecStream(stream);
    return stream;
  }

  async generateUI(input: UIRequest): Promise<string> {
    switch (input.strategy) {
      case "json-render":
        return await this.generateJsonRender(input);
      case "sample":
        return "a";
    }
  }

  async generateExtractor(
    input: AugmentationRequest,
  ): Promise<DOMExtractorSpec> {
    const dom = JSON.stringify(input.snapshot);

    const promptSystem = loadPrompt(extractorPromptSystem, {
      dom,
    });

    const promptUser = loadPrompt(extractorPromptUser, {
      dom,
    });

    const result = await generateText({
      model: this.openai("gpt-5.4-mini"),
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        },
      },
      output: Output.object({
        schema: DOMExtractorSpecSchema,
      }),
      system: promptSystem,
      prompt: promptUser,
    });

    return result.output;
  }
}
