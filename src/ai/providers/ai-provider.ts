import { AugmentationRequest } from "@/types";
import { DOMExtractorSpec } from "../../services/dom-extractor";

type UIRequest = object; // TODO
type UISpec = object; // TODO

export interface AIProvider {
  generateExtractor(input: AugmentationRequest): Promise<DOMExtractorSpec>;
  generateUI(input: UIRequest): Promise<UISpec>;
}
