import { Preprocessor } from "../markup-renderer";
import { escapeHtml, resolvePath } from "./shared";

export const resolveData: Preprocessor = (data, spec) => {
  const html = spec.replace(/\{\{([\w.\[\]]+)\}\}/g, (_, path) => {
    const value = resolvePath(data, path);
    return value != null ? escapeHtml(String(value)) : `{{${path}}}`;
  });
  return html;
};
