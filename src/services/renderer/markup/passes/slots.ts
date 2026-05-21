import { Visitor } from "../markup-renderer";
import { fillDataSlots } from "./shared";

export const resolveData: Visitor = (root, data) => {
  fillDataSlots(root.body, "data", data.data, false);
  return root;
};
