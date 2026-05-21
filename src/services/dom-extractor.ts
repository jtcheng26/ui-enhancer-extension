import { z } from "zod";
import { buildElementSelector, buildStructuralSelector } from "./selector";

export const TransformSchema = z.discriminatedUnion("fn", [
  z.object({ fn: z.literal("trim") }),
  z.object({ fn: z.literal("lowercase") }),
  z.object({ fn: z.literal("uppercase") }),
  z.object({ fn: z.literal("parseNumber") }),
  z.object({
    fn: z.literal("replace"),
    pattern: z.string(),
    with: z.string(),
    flags: z.string().optional(),
  }),
  z.object({
    fn: z.literal("slice"),
    start: z.number().int(),
    end: z.number().int().optional(),
  }),
  z.object({ fn: z.literal("defaultIfEmpty"), value: z.string() }),
]);

export const FilterSchema: z.ZodType<{
  textMatches?: string;
  attrMatches?: Record<string, string>;
  hasChild?: string;
  not?: {
    textMatches?: string;
    attrMatches?: Record<string, string>;
    hasChild?: string;
    not?: any;
  };
}> = z.lazy(() =>
  z.object({
    textMatches: z.string().optional(),
    attrMatches: z.record(z.string(), z.string()).optional(),
    hasChild: z.string().optional(),
    not: FilterSchema.optional(),
  }),
);

const ValueSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    selectors: z.array(z.string()).min(1),
    transform: z.array(TransformSchema).optional(),
  }),
  z.object({
    type: z.literal("attr"),
    selectors: z.array(z.string()).min(1),
    attr: z.string().min(1),
    transform: z.array(TransformSchema).optional(),
  }),
  z.object({
    type: z.literal("exists"),
    selectors: z.array(z.string()).min(1),
    filter: FilterSchema.optional(),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string(),
    flags: z.string().optional(),
    group: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal("lines"),
    pick: z.union([z.literal("first"), z.literal("last"), z.number().int()]),
  }),
  z.object({
    type: z.literal("static"),
    value: z.unknown(),
  }),
]);

const DeriveFnSchema = z.enum([
  "arrayNotEmpty",
  "arrayLength",
  "isNull",
  "not",
  "toString",
  "toNumber",
]);

export const ExtractorFieldSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("value"),
    sources: z.array(ValueSourceSchema).min(1),
    nullable: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("list"),
    selectors: z.array(z.string()).min(1),
    item: z.string().min(1),
    filter: FilterSchema.optional(),
    exclude: FilterSchema.optional(),
    unique: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("derive"),
    from: z.string().min(1),
    fn: DeriveFnSchema,
  }),
  z.object({
    kind: z.literal("clickAction"),
    selector: z.string().min(1),
    filter: FilterSchema.optional(),
  }),
]);

export const RootSpecSchema = z.object({
  selector: z.string().optional(),
  output: z.string().min(1),
});

export type SimpleExtractorField =
  | {
      type: "text";
      selector: string;
      attribute?: string;
    }
  | {
      type: "url";
      selector: string;
      attribute?: string;
    }
  | {
      type: "action";
      selector: string;
    }
  | {
      type: "input";
      selector: string;
    }
  | {
      type: "group";
      selector?: string;
      fields: Record<string, SimpleExtractorField>;
    }
  | {
      type: "list";
      selector: string;
      fields: Record<string, SimpleExtractorField>;
    };

export interface SimpleDOMExtractorSpec {
  root: RootSpec;
  fields: Record<string, SimpleExtractorField>;
}

export interface LLMSimpleDOMExtractorSpec {
  fields: Record<string, SimpleExtractorField>;
}

export const SimpleFieldSchema: z.ZodType<SimpleExtractorField> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      selector: z.string(),
      attribute: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal("url"),
      selector: z.string(),
      attribute: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal("action"),
      selector: z.string(),
    }),
    z.object({
      type: z.literal("input"),
      selector: z.string(),
    }),
    z.object({
      type: z.literal("group"),
      selector: z.string().optional(),
      fields: z.record(z.string(), SimpleFieldSchema),
    }),
    z.object({
      type: z.literal("list"),
      selector: z.string(),
      fields: z.record(z.string(), SimpleFieldSchema),
    }),
  ]),
);

export const SimpleDOMExtractorSpecSchema: z.ZodType<SimpleDOMExtractorSpec> =
  z.object({
    root: RootSpecSchema,
    fields: z.record(z.string(), SimpleFieldSchema),
  });

export const LLMSimpleDOMExtractorSpecSchema: z.ZodType<LLMSimpleDOMExtractorSpec> =
  z.object({
    fields: z.record(z.string(), SimpleFieldSchema),
  });

export const LegacyDOMExtractorSpecSchema = z.object({
  root: RootSpecSchema,
  extractors: z.record(z.string(), z.record(z.string(), ExtractorFieldSchema)),
});

export const DOMExtractorSpecSchema = z.union([
  SimpleDOMExtractorSpecSchema,
  LegacyDOMExtractorSpecSchema,
]);

export type Transform = z.infer<typeof TransformSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type ValueSource = z.infer<typeof ValueSourceSchema>;
export type DeriveFn = z.infer<typeof DeriveFnSchema>;
export type ExtractorField = z.infer<typeof ExtractorFieldSchema>;
export type RootSpec = z.infer<typeof RootSpecSchema>;
export type LegacyDOMExtractorSpec = z.infer<
  typeof LegacyDOMExtractorSpecSchema
>;
export type DOMExtractorSpec = SimpleDOMExtractorSpec | LegacyDOMExtractorSpec;
export type ExtractorMap = LegacyDOMExtractorSpec["extractors"][string];

export interface ClickActionValue {
  type: "clickAction";
  selector: string;
  filter?: Filter;
}

export interface InputValue {
  type: "input";
  selector?: string;
  tagName: string;
  inputType?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  options?: string[];
}

export type ExtractedValue =
  | string
  | boolean
  | number
  | null
  | ClickActionValue
  | InputValue
  | ExtractedValue[]
  | { [key: string]: ExtractedValue };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateSelector(
  selector: string,
  path: string,
  frag: DocumentFragment,
  errors: string[],
) {
  try {
    frag.querySelector(selector);
  } catch {
    errors.push(`${path}: invalid CSS selector "${selector}"`);
  }
}

function validateSimpleSelectorSyntax(
  selector: string,
  path: string,
  errors: string[],
) {
  const trimmedSelector = selector.trim();

  if (trimmedSelector.length === 0) {
    errors.push(`${path}: selector must not be empty`);
    return;
  }

  const disallowedPatterns: Array<[RegExp, string]> = [
    [/[~]/, 'general sibling combinator "~"'],
    [/[+]/, 'adjacent sibling combinator "+"'],
    [/[,]/, 'selector list separator ","'],
    [/::/, "pseudo-elements"],
    [/:has\(/i, ":has()"],
    [/:is\(/i, ":is()"],
    [/:where\(/i, ":where()"],
    [/:not\(/i, ":not()"],
  ];

  for (const [pattern, label] of disallowedPatterns) {
    if (pattern.test(trimmedSelector)) {
      errors.push(
        `${path}: unsupported selector syntax ${label} in "${selector}"`,
      );
      return;
    }
  }
}

function validateRegex(
  pattern: string,
  flags: string,
  path: string,
  errors: string[],
) {
  try {
    new RegExp(pattern, flags);
  } catch {
    errors.push(`${path}: invalid regex /${pattern}/${flags}`);
  }
}

function validateFilter(
  filter: Filter,
  path: string,
  frag: DocumentFragment,
  errors: string[],
): void {
  if (filter.textMatches !== undefined) {
    validateRegex(filter.textMatches, "", `${path}.textMatches`, errors);
  }

  if (filter.attrMatches !== undefined) {
    for (const [attr, pattern] of Object.entries(filter.attrMatches)) {
      validateRegex(pattern, "", `${path}.attrMatches.${attr}`, errors);
    }
  }

  if (filter.hasChild !== undefined) {
    validateSelector(filter.hasChild, `${path}.hasChild`, frag, errors);
  }

  if (filter.not !== undefined) {
    validateFilter(filter.not, `${path}.not`, frag, errors);
  }
}

function isSimpleDOMExtractorSpec(raw: unknown): raw is SimpleDOMExtractorSpec {
  return (
    raw !== null &&
    typeof raw === "object" &&
    "fields" in raw &&
    !("extractors" in raw)
  );
}

function isLegacyDOMExtractorSpec(raw: unknown): raw is LegacyDOMExtractorSpec {
  return raw !== null && typeof raw === "object" && "extractors" in raw;
}

function validateSimpleField(
  field: SimpleExtractorField,
  path: string,
  frag: DocumentFragment,
  errors: string[],
): void {
  switch (field.type) {
    case "text":
    case "url":
    case "action":
    case "input":
      validateSimpleSelectorSyntax(field.selector, `${path}.selector`, errors);
      validateSelector(field.selector, `${path}.selector`, frag, errors);
      break;
    case "group":
      if (field.selector) {
        validateSimpleSelectorSyntax(
          field.selector,
          `${path}.selector`,
          errors,
        );
        validateSelector(field.selector, `${path}.selector`, frag, errors);
      }

      for (const [fieldName, childField] of Object.entries(field.fields)) {
        validateSimpleField(
          childField,
          `${path}.fields.${fieldName}`,
          frag,
          errors,
        );
      }
      break;
    case "list":
      validateSimpleSelectorSyntax(field.selector, `${path}.selector`, errors);
      validateSelector(field.selector, `${path}.selector`, frag, errors);

      for (const [fieldName, childField] of Object.entries(field.fields)) {
        validateSimpleField(
          childField,
          `${path}.fields.${fieldName}`,
          frag,
          errors,
        );
      }
      break;
  }
}

function semanticValidateSimple(
  spec: SimpleDOMExtractorSpec,
  errors: string[],
): void {
  const frag = document.createDocumentFragment();

  if (spec.root.selector) {
    validateSelector(spec.root.selector, "root.selector", frag, errors);
  }

  if (Object.keys(spec.fields).length === 0) {
    errors.push("fields: expected at least one field");
  }

  for (const [fieldName, field] of Object.entries(spec.fields)) {
    validateSimpleField(field, `fields.${fieldName}`, frag, errors);
  }
}

function semanticValidateLegacy(
  spec: LegacyDOMExtractorSpec,
  errors: string[],
): void {
  const extractorKeys = new Set(Object.keys(spec.extractors));
  const frag = document.createDocumentFragment();

  if (!extractorKeys.has(spec.root.output)) {
    errors.push(
      `root.output "${spec.root.output}" is not defined in extractors`,
    );
  }

  if (spec.root.selector) {
    validateSelector(spec.root.selector, "root.selector", frag, errors);
  }

  for (const [typeName, extractorMap] of Object.entries(spec.extractors)) {
    const fieldNames = new Set(Object.keys(extractorMap));

    for (const [fieldName, field] of Object.entries(extractorMap)) {
      const fieldPath = `extractors.${typeName}.${fieldName}`;

      switch (field.kind) {
        case "value":
          field.sources.forEach((source, index) => {
            const sourcePath = `${fieldPath}.sources[${index}]`;

            if ("selectors" in source) {
              source.selectors.forEach((selector, selectorIndex) => {
                validateSelector(
                  selector,
                  `${sourcePath}.selectors[${selectorIndex}]`,
                  frag,
                  errors,
                );
              });
            }

            if (source.type === "exists" && source.filter) {
              validateFilter(
                source.filter,
                `${sourcePath}.filter`,
                frag,
                errors,
              );
            }

            if (source.type === "regex") {
              validateRegex(
                source.pattern,
                source.flags ?? "",
                `${sourcePath}.pattern`,
                errors,
              );
            }
          });
          break;
        case "list":
          field.selectors.forEach((selector, selectorIndex) => {
            validateSelector(
              selector,
              `${fieldPath}.selectors[${selectorIndex}]`,
              frag,
              errors,
            );
          });

          if (!extractorKeys.has(field.item)) {
            errors.push(
              `${fieldPath}.item references unknown extractor "${field.item}"`,
            );
          }

          if (field.filter) {
            validateFilter(field.filter, `${fieldPath}.filter`, frag, errors);
          }

          if (field.exclude) {
            validateFilter(field.exclude, `${fieldPath}.exclude`, frag, errors);
          }
          break;
        case "derive":
          if (field.from === fieldName) {
            errors.push(`${fieldPath}.from cannot reference itself`);
          } else if (!fieldNames.has(field.from)) {
            errors.push(
              `${fieldPath}.from "${field.from}" is not a sibling field in extractors.${typeName}`,
            );
          }
          break;
        case "clickAction":
          validateSelector(
            field.selector,
            `${fieldPath}.selector`,
            frag,
            errors,
          );
          if (field.filter) {
            validateFilter(field.filter, `${fieldPath}.filter`, frag, errors);
          }
          break;
      }
    }
  }
}

export function validateSpec(raw: unknown): ValidationResult {
  if (isSimpleDOMExtractorSpec(raw)) {
    const result = SimpleDOMExtractorSpecSchema.safeParse(raw);
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".") || "/"}: ${issue.message}`,
        ),
      };
    }

    const semanticErrors: string[] = [];
    semanticValidateSimple(result.data, semanticErrors);
    return { valid: semanticErrors.length === 0, errors: semanticErrors };
  }

  if (isLegacyDOMExtractorSpec(raw)) {
    const result = LegacyDOMExtractorSpecSchema.safeParse(raw);
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map(
          (issue) => `${issue.path.join(".") || "/"}: ${issue.message}`,
        ),
      };
    }

    const semanticErrors: string[] = [];
    semanticValidateLegacy(result.data, semanticErrors);
    return { valid: semanticErrors.length === 0, errors: semanticErrors };
  }

  const fallbackResult = DOMExtractorSpecSchema.safeParse(raw);
  if (!fallbackResult.success) {
    return {
      valid: false,
      errors: fallbackResult.error.issues.map(
        (issue) => `${issue.path.join(".") || "/"}: ${issue.message}`,
      ),
    };
  }

  return {
    valid: false,
    errors: [
      '/: expected an extractor spec with either "fields" or "extractors"',
    ],
  };
}

export function matchesFilter(el: Element, filter: Filter): boolean {
  if (filter.textMatches !== undefined) {
    if (!new RegExp(filter.textMatches).test(el.textContent ?? "")) {
      return false;
    }
  }

  if (filter.attrMatches !== undefined) {
    for (const [attr, pattern] of Object.entries(filter.attrMatches)) {
      const value = el.getAttribute(attr) ?? "";
      if (!new RegExp(pattern).test(value)) {
        return false;
      }
    }
  }

  if (filter.hasChild !== undefined && !el.querySelector(filter.hasChild)) {
    return false;
  }

  if (filter.not !== undefined && matchesFilter(el, filter.not)) {
    return false;
  }

  return true;
}

function queryFirst(
  scope: Element | Document,
  selectors: string[],
): Element | null {
  for (const selector of selectors) {
    const element = scope.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return null;
}

function queryFirstAll(
  scope: Element | Document,
  selectors: string[],
): Element[] {
  for (const selector of selectors) {
    const elements = Array.from(scope.querySelectorAll(selector));
    if (elements.length > 0) {
      return elements;
    }
  }

  return [];
}

function queryOne(scope: Element | Document, selector: string): Element | null {
  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function queryAll(scope: Element | Document, selector: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readTextFieldValue(
  element: Element,
  attribute?: string,
): string | null {
  if (attribute) {
    const attributeValue = element.getAttribute(attribute);
    return attributeValue ? normalizeText(attributeValue) || null : null;
  }

  const text = normalizeText(element.textContent);
  return text || null;
}

function readUrlFieldValue(
  element: Element,
  attribute?: string,
): string | null {
  const attributes = attribute
    ? [attribute]
    : element instanceof HTMLAnchorElement
      ? ["href"]
      : element instanceof HTMLImageElement
        ? ["src"]
        : element instanceof HTMLFormElement
          ? ["action"]
          : ["href", "src", "action"];

  for (const attributeName of attributes) {
    const propertyValue =
      attributeName in element
        ? (element as unknown as Record<string, unknown>)[attributeName]
        : null;
    const rawValue =
      typeof propertyValue === "string"
        ? propertyValue
        : element.getAttribute(attributeName);
    const normalizedValue = normalizeText(rawValue);

    if (!normalizedValue) {
      continue;
    }

    try {
      return new URL(normalizedValue, element.ownerDocument.baseURI).toString();
    } catch {
      return normalizedValue;
    }
  }

  return null;
}

function getLabelTextForInput(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string | undefined {
  const labelFromCollection = Array.from(element.labels ?? [])
    .map((label) => normalizeText(label.textContent))
    .find(Boolean);

  if (labelFromCollection) {
    return labelFromCollection;
  }

  const ariaLabel = normalizeText(element.getAttribute("aria-label"));
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = normalizeText(element.getAttribute("aria-labelledby"));
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) =>
        normalizeText(element.ownerDocument.getElementById(id)?.textContent),
      )
      .filter(Boolean)
      .join(" ");

    if (labelText) {
      return labelText;
    }
  }

  return undefined;
}

function readInputFieldValue(element: Element): InputValue | null {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    return null;
  }

  const baseValue: InputValue = {
    type: "input",
    selector: buildElementSelector(element, element.ownerDocument),
    tagName: element.tagName.toLowerCase(),
    name: element.getAttribute("name") || undefined,
    label: getLabelTextForInput(element),
    placeholder:
      "placeholder" in element
        ? normalizeText(element.placeholder) || undefined
        : undefined,
    disabled: element.disabled || undefined,
    required: element.required || undefined,
  };

  if (element instanceof HTMLInputElement) {
    const isCheckedInput =
      element.type === "checkbox" || element.type === "radio";

    return {
      ...baseValue,
      inputType: element.type || "text",
      checked: isCheckedInput ? element.checked : undefined,
      value: isCheckedInput ? undefined : normalizeText(element.value) || "",
    };
  }

  if (element instanceof HTMLTextAreaElement) {
    return {
      ...baseValue,
      value: normalizeText(element.value) || "",
    };
  }

  return {
    ...baseValue,
    value: normalizeText(element.value) || "",
    options: Array.from(element.options)
      .map((option) => normalizeText(option.textContent))
      .filter(Boolean)
      .slice(0, 12),
  };
}

function hasMeaningfulExtractedValue(value: ExtractedValue): boolean {
  if (value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulExtractedValue(item));
  }

  if ("type" in value) {
    return true;
  }

  return Object.values(value).some((item) => hasMeaningfulExtractedValue(item));
}

function executeSimpleFields(
  scope: Element | Document,
  fields: Record<string, SimpleExtractorField>,
): Record<string, ExtractedValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([fieldName, field]) => [
      fieldName,
      executeSimpleField(scope, field),
    ]),
  );
}

function executeSimpleField(
  scope: Element | Document,
  field: SimpleExtractorField,
): ExtractedValue {
  switch (field.type) {
    case "text": {
      const element = queryOne(scope, field.selector);
      return element ? readTextFieldValue(element, field.attribute) : null;
    }
    case "url": {
      const element = queryOne(scope, field.selector);
      return element ? readUrlFieldValue(element, field.attribute) : null;
    }
    case "action": {
      const element = queryOne(scope, field.selector);
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      return {
        type: "clickAction",
        selector:
          buildElementSelector(element, element.ownerDocument) ||
          buildStructuralSelector(element, element.ownerDocument),
      } satisfies ClickActionValue;
    }
    case "input": {
      const element = queryOne(scope, field.selector);
      return element ? readInputFieldValue(element) : null;
    }
    case "group": {
      const groupScope = field.selector
        ? queryOne(scope, field.selector)
        : scope;
      return groupScope ? executeSimpleFields(groupScope, field.fields) : null;
    }
    case "list": {
      const elements = queryAll(scope, field.selector);
      return elements
        .map((element) => executeSimpleFields(element, field.fields))
        .filter((item) => hasMeaningfulExtractedValue(item));
    }
  }
}

function applyTransforms(value: string, transforms: Transform[]): string {
  let nextValue = value;

  for (const transform of transforms) {
    switch (transform.fn) {
      case "trim":
        nextValue = nextValue.trim();
        break;
      case "lowercase":
        nextValue = nextValue.toLowerCase();
        break;
      case "uppercase":
        nextValue = nextValue.toUpperCase();
        break;
      case "replace":
        nextValue = nextValue.replace(
          new RegExp(transform.pattern, transform.flags ?? ""),
          transform.with,
        );
        break;
      case "slice":
        nextValue = nextValue.slice(transform.start, transform.end);
        break;
      case "defaultIfEmpty":
        nextValue = nextValue.trim() === "" ? transform.value : nextValue;
        break;
      case "parseNumber":
        nextValue = String(parseFloat(nextValue));
        break;
    }
  }

  return nextValue;
}

function applyDerive(value: ExtractedValue, fn: DeriveFn): ExtractedValue {
  switch (fn) {
    case "arrayNotEmpty":
      return Array.isArray(value) && value.length > 0;
    case "arrayLength":
      return Array.isArray(value) ? value.length : 0;
    case "isNull":
      return value === null;
    case "not":
      return !value;
    case "toString":
      return value === null ? "" : String(value);
    case "toNumber":
      return Number(value);
  }
}

function getScopeText(scope: Element | Document): string {
  return (
    (scope instanceof Element ? scope.textContent : scope.body?.textContent) ??
    ""
  );
}

interface SourceResult {
  matched: boolean;
  value: ExtractedValue;
}

function executeValueSource(
  source: ValueSource,
  scope: Element | Document,
): SourceResult {
  switch (source.type) {
    case "text": {
      const element = queryFirst(scope, source.selectors);
      if (!element) {
        return { matched: false, value: "" };
      }

      let value = element.textContent?.trim() ?? "";
      if (source.transform) {
        value = applyTransforms(value, source.transform);
      }

      return { matched: true, value };
    }
    case "attr": {
      const element = queryFirst(scope, source.selectors);
      if (!element) {
        return { matched: false, value: "" };
      }

      const attrValue = element.getAttribute(source.attr);
      if (attrValue === null) {
        return { matched: false, value: "" };
      }

      let value = attrValue;
      if (source.transform) {
        value = applyTransforms(value, source.transform);
      }

      return { matched: true, value };
    }
    case "exists": {
      const elements = queryFirstAll(scope, source.selectors);
      if (elements.length === 0) {
        return { matched: false, value: false };
      }

      const value = source.filter
        ? elements.some((element) => matchesFilter(element, source.filter!))
        : true;
      return { matched: true, value };
    }
    case "regex": {
      const match = new RegExp(source.pattern, source.flags ?? "").exec(
        getScopeText(scope),
      );
      if (!match) {
        return { matched: false, value: "" };
      }

      const value = match[source.group ?? 0];
      if (value === undefined) {
        return { matched: false, value: "" };
      }

      return { matched: true, value };
    }
    case "lines": {
      const lines = getScopeText(scope)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const value =
        source.pick === "first"
          ? lines[0]
          : source.pick === "last"
            ? lines[lines.length - 1]
            : lines[source.pick];

      if (value === undefined) {
        return { matched: false, value: "" };
      }

      return { matched: true, value };
    }
    case "static":
      return { matched: true, value: source.value as ExtractedValue };
  }
}

function defaultValueForField(
  field: Extract<ExtractorField, { kind: "value" }>,
) {
  if (field.nullable) {
    return null;
  }

  const firstSource = field.sources[0];
  if (!firstSource) {
    return null;
  }

  return firstSource.type === "exists" ? false : "";
}

function applyListPostProcess(
  items: ExtractedValue[],
  field: Extract<ExtractorField, { kind: "list" }>,
): ExtractedValue[] {
  let result = items;

  if (field.unique) {
    const seen = new Set<string>();
    result = result.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  return result;
}

let executeExtractor: (
  scope: Element | Document,
  extractorMap: ExtractorMap,
  allExtractors: Record<string, ExtractorMap>,
) => Record<string, ExtractedValue>;

function executeField(
  field: ExtractorField,
  scope: Element | Document,
  allExtractors: Record<string, ExtractorMap>,
  siblings: Record<string, ExtractedValue>,
): ExtractedValue {
  switch (field.kind) {
    case "value": {
      for (const source of field.sources) {
        const result = executeValueSource(source, scope);
        if (result.matched) {
          return result.value;
        }
      }

      return defaultValueForField(field);
    }
    case "list": {
      const itemExtractor = allExtractors[field.item];
      if (!itemExtractor) {
        return [];
      }

      let elements = queryFirstAll(scope, field.selectors);
      if (field.filter) {
        elements = elements.filter((element) =>
          matchesFilter(element, field.filter!),
        );
      }

      if (field.exclude) {
        elements = elements.filter(
          (element) => !matchesFilter(element, field.exclude!),
        );
      }

      const items = elements.map((element) =>
        executeExtractor(element, itemExtractor, allExtractors),
      );

      return applyListPostProcess(items, field);
    }
    case "derive": {
      const value = siblings[field.from];
      if (value === undefined) {
        return null;
      }

      return applyDerive(value, field.fn);
    }
    case "clickAction": {
      const element = Array.from(scope.querySelectorAll(field.selector)).find(
        (candidate) =>
          field.filter ? matchesFilter(candidate, field.filter) : true,
      );
      if (!element) {
        return null;
      }

      const action: ClickActionValue = {
        type: "clickAction",
        selector: field.selector,
      };
      if (field.filter) {
        action.filter = field.filter;
      }

      return action;
    }
  }
}

function topoSortFields(extractorMap: ExtractorMap): string[] {
  const keys = Object.keys(extractorMap);
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(key: string, stack: Set<string>) {
    if (visited.has(key)) {
      return;
    }

    if (stack.has(key)) {
      throw new Error(`Circular derive dependency at field "${key}"`);
    }

    stack.add(key);
    const field = extractorMap[key];
    if (field.kind === "derive" && extractorMap[field.from]) {
      visit(field.from, stack);
    }
    stack.delete(key);
    visited.add(key);
    sorted.push(key);
  }

  for (const key of keys) {
    visit(key, new Set());
  }

  return sorted;
}

executeExtractor = (
  scope: Element | Document,
  extractorMap: ExtractorMap,
  allExtractors: Record<string, ExtractorMap>,
): Record<string, ExtractedValue> => {
  const result: Record<string, ExtractedValue> = {};
  const order = topoSortFields(extractorMap);

  for (const fieldName of order) {
    result[fieldName] = executeField(
      extractorMap[fieldName],
      scope,
      allExtractors,
      result,
    );
  }

  return result;
};

function resolveRootScope(
  root: RootSpec,
  rootEl: Document | Element,
): Element | Document | null {
  let scope: Document | Element = rootEl;

  if (!root.selector) {
    return scope;
  }

  const found =
    (rootEl instanceof Document
      ? rootEl
      : (rootEl.ownerDocument ?? document)
    ).querySelector(root.selector)?.parentElement ??
    (rootEl instanceof Element
      ? rootEl.querySelector(root.selector)?.parentElement
      : null);

  if (!found) {
    return scope;
  }

  return found;
}

function parseSimpleSpec(
  spec: SimpleDOMExtractorSpec,
  rootEl: Document | Element,
): {
  data: Record<string, ExtractedValue> | null;
  root: Element | Document | null;
} {
  const scope = resolveRootScope(spec.root, rootEl);
  if (!scope) {
    return { data: null, root: null };
  }

  return {
    data: executeSimpleFields(scope, spec.fields),
    root: spec.root.selector ? scope.querySelector(spec.root.selector) : scope,
  };
}

function parseLegacySpec(
  spec: LegacyDOMExtractorSpec,
  rootEl: Document | Element,
): {
  data: Record<string, ExtractedValue> | null;
  root: Element | Document | null;
} {
  const scope = resolveRootScope(spec.root, rootEl);
  if (!scope) {
    return { data: null, root: null };
  }

  const rootExtractor = spec.extractors[spec.root.output];
  if (!rootExtractor) {
    throw new Error(
      `No extractor defined for root output type "${spec.root.output}"`,
    );
  }

  return {
    data: executeExtractor(scope, rootExtractor, spec.extractors),
    root: scope,
  };
}

export function parseSpec(
  spec: DOMExtractorSpec,
  rootEl: Document | Element = document,
): {
  data: Record<string, ExtractedValue> | null;
  root: Element | Document | null;
} {
  return isSimpleDOMExtractorSpec(spec)
    ? parseSimpleSpec(spec, rootEl)
    : parseLegacySpec(spec, rootEl);
}

export function validateAndParse(
  raw: unknown,
  rootEl: Document | Element = document,
): {
  data: Record<string, ExtractedValue> | null;
  root: Element | Document | null;
  errors: string[];
} {
  const validation = validateSpec(raw);
  if (!validation.valid) {
    return { data: null, root: rootEl, errors: validation.errors };
  }

  try {
    const { data, root } = parseSpec(raw as DOMExtractorSpec, rootEl);
    return { data, root, errors: [] };
  } catch (error) {
    return { data: null, root: rootEl, errors: [(error as Error).message] };
  }
}
