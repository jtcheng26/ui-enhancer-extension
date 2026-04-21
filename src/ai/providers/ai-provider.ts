import { AugmentationRequest, CreateUiCommandPayload } from "@/types";
import { DOMExtractorSpec } from "../../services/dom-extractor";
import { Spec } from "@json-render/react";

export type UIRequest = CreateUiCommandPayload;

export interface AIProvider {
  generateExtractor(input: AugmentationRequest): Promise<DOMExtractorSpec>;
  generateUI(input: UIRequest): Promise<string>;
}
