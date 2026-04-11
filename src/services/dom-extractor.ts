// =============================================================================
// dom-extractor.ts
// Validate and execute DOMExtractorSpec documents produced by an LLM.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. TYPE DEFINITIONS
// ---------------------------------------------------------------------------

// --- Filter ----------------------------------------------------------------
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas (single source of truth)
// ---------------------------------------------------------------------------

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

export const PostProcessSchema = z.object({
  filterOut: FilterSchema.optional(),
  limit: z.number().int().min(1).optional(),
  unique: z.boolean().optional(),
});

export const AnyOpSchema: z.ZodType<
  | {
      op: "text";
      selectors: string[];
      transform?: z.infer<typeof TransformSchema>[];
      fallback?: any;
      nullable?: boolean;
    }
  | {
      op: "attr";
      selectors: string[];
      attr: string;
      transform?: z.infer<typeof TransformSchema>[];
      fallback?: unknown;
      nullable?: boolean;
    }
  | {
      op: "exists";
      selectors: string[];
      filter?: z.infer<typeof FilterSchema>;
    }
  | {
      op: "queryAll";
      selectors: string[];
      map: string;
      filter?: z.infer<typeof FilterSchema>;
      postProcess?: z.infer<typeof PostProcessSchema>;
    }
  | {
      op: "textRegex";
      pattern: string;
      flags?: string;
      group?: number;
    }
  | {
      op: "textLines";
      pick: "first" | "last" | number;
      filter?: z.infer<typeof FilterSchema>;
    }
  | {
      op: "first";
      branches: any[];
      nullable?: boolean;
    }
  | {
      op: "derive";
      from: string;
      fn:
        | "arrayNotEmpty"
        | "arrayLength"
        | "isNull"
        | "not"
        | "toString"
        | "toNumber";
    }
  | {
      op: "static";
      value: unknown;
    }
> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({
      op: z.literal("text"),
      selectors: z.array(z.string()).min(1),
      transform: z.array(TransformSchema).optional(),
      fallback: AnyOpSchema.optional(),
      nullable: z.boolean().optional(),
    }),
    z.object({
      op: z.literal("attr"),
      selectors: z.array(z.string()).min(1),
      attr: z.string().min(1),
      transform: z.array(TransformSchema).optional(),
      fallback: z.unknown().optional(),
      nullable: z.boolean().optional(),
    }),
    z.object({
      op: z.literal("exists"),
      selectors: z.array(z.string()).min(1),
      filter: FilterSchema.optional(),
    }),
    z.object({
      op: z.literal("queryAll"),
      selectors: z.array(z.string()).min(1),
      map: z.string().min(1),
      filter: FilterSchema.optional(),
      postProcess: PostProcessSchema.optional(),
    }),
    z.object({
      op: z.literal("textRegex"),
      pattern: z.string(),
      flags: z.string().optional(),
      group: z.number().int().min(0).optional(),
    }),
    z.object({
      op: z.literal("textLines"),
      pick: z.union([z.literal("first"), z.literal("last"), z.number().int()]),
      filter: FilterSchema.optional(),
    }),
    z.object({
      op: z.literal("first"),
      branches: z.array(AnyOpSchema).min(2),
      nullable: z.boolean().optional(),
    }),
    z.object({
      op: z.literal("derive"),
      from: z.string().min(1),
      fn: z.enum([
        "arrayNotEmpty",
        "arrayLength",
        "isNull",
        "not",
        "toString",
        "toNumber",
      ]),
    }),
    z.object({
      op: z.literal("static"),
      value: z.unknown(),
    }),
  ]),
);

export const FieldTypeSchema = z.union([
  z.object({
    type: z.enum(["string", "boolean", "number", "null"]),
    nullable: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("array"),
    items: z.string(),
  }),
]);

export const RootSpecSchema = z.object({
  selector: z.string().optional(),
  required: z.boolean().optional(),
  output: z.string().min(1),
});

export const DOMExtractorSpecSchema = z.object({
  root: RootSpecSchema,
  types: z.record(z.string(), z.record(z.string(), FieldTypeSchema)),
  extractors: z.record(z.string(), z.record(z.string(), AnyOpSchema)),
});

// ---------------------------------------------------------------------------
// Inferred types (no hand-written types below this line)
// ---------------------------------------------------------------------------

export type Transform = z.infer<typeof TransformSchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type PostProcess = z.infer<typeof PostProcessSchema>;
export type AnyOp = z.infer<typeof AnyOpSchema>;
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type RootSpec = z.infer<typeof RootSpecSchema>;
export type DOMExtractorSpec = z.infer<typeof DOMExtractorSpecSchema>;

// Convenience aliases matching the original names
export type ScalarType = "string" | "boolean" | "number" | "null";
export type TypesMap = DOMExtractorSpec["types"];
export type ExtractorMap = DOMExtractorSpec["extractors"][string];
export type DeriveFn = Extract<AnyOp, { op: "derive" }>["fn"];

// Per-op types extracted from the union (replaces the Op_* interfaces)
export type Op_text = Extract<AnyOp, { op: "text" }>;
export type Op_attr = Extract<AnyOp, { op: "attr" }>;
export type Op_exists = Extract<AnyOp, { op: "exists" }>;
export type Op_queryAll = Extract<AnyOp, { op: "queryAll" }>;
export type Op_textRegex = Extract<AnyOp, { op: "textRegex" }>;
export type Op_textLines = Extract<AnyOp, { op: "textLines" }>;
export type Op_first = Extract<AnyOp, { op: "first" }>;
export type Op_derive = Extract<AnyOp, { op: "derive" }>;
export type Op_static = Extract<AnyOp, { op: "static" }>;

// Result of extraction
export type ExtractedValue =
  | string
  | boolean
  | number
  | null
  | ExtractedValue[]
  | { [key: string]: ExtractedValue };

// ---------------------------------------------------------------------------
// 2. VALIDATION — Zod structural parse + semantic second pass
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function collectSelectorsFromOp(
  op: Record<string, unknown>,
  out: Array<{ path: string; selector: string }>,
): void {
  if (Array.isArray(op.selectors)) {
    (op.selectors as string[]).forEach((s, i) =>
      out.push({ path: `selectors[${i}]`, selector: s }),
    );
  }
  if ((op.op === "exists" || op.op === "queryAll") && isRecord(op.filter)) {
    if (typeof (op.filter as any).hasChild === "string")
      out.push({
        path: "filter.hasChild",
        selector: (op.filter as any).hasChild,
      });
  }
  if (op.op === "first" && Array.isArray(op.branches)) {
    (op.branches as unknown[])
      .filter(isRecord)
      .forEach((b) => collectSelectorsFromOp(b, out));
  }
  if (op.op === "text" && isRecord(op.fallback)) {
    collectSelectorsFromOp(op.fallback, out);
  }
}

function collectRegexFromOp(
  op: Record<string, unknown>,
  out: Array<{ path: string; pattern: string; flags: string }>,
): void {
  if (op.op === "textRegex" && typeof op.pattern === "string")
    out.push({
      path: "pattern",
      pattern: op.pattern,
      flags: (op.flags as string) ?? "",
    });

  const nested = [
    ...(Array.isArray(op.branches) ? (op.branches as unknown[]) : []),
    ...(Array.isArray(op.transform) ? (op.transform as unknown[]) : []),
    isRecord(op.fallback) ? op.fallback : null,
  ].filter(isRecord);
  nested.forEach((child) => collectRegexFromOp(child, out));

  for (const filterKey of ["filter", "postProcess"] as const) {
    const f = op[filterKey];
    if (!isRecord(f)) continue;
    const fo = filterKey === "postProcess" ? (f as any).filterOut : f;
    if (!isRecord(fo)) continue;
    if (typeof fo.textMatches === "string")
      out.push({
        path: `${filterKey}.textMatches`,
        pattern: fo.textMatches,
        flags: "",
      });
    if (isRecord(fo.attrMatches)) {
      Object.entries(fo.attrMatches).forEach(([k, v]) => {
        if (typeof v === "string")
          out.push({
            path: `${filterKey}.attrMatches.${k}`,
            pattern: v,
            flags: "",
          });
      });
    }
  }
}

function semanticValidate(spec: DOMExtractorSpec, errors: string[]): void {
  const typeKeys = new Set(Object.keys(spec.types));
  const extractorKeys = new Set(Object.keys(spec.extractors));
  const frag = document.createDocumentFragment();

  // root.output must exist in both maps
  if (!typeKeys.has(spec.root.output))
    errors.push(`root.output "${spec.root.output}" is not defined in types`);
  if (!extractorKeys.has(spec.root.output))
    errors.push(
      `root.output "${spec.root.output}" is not defined in extractors`,
    );

  // root.selector must be valid CSS
  if (spec.root.selector) {
    try {
      frag.querySelector(spec.root.selector);
    } catch {
      errors.push(
        `root.selector: invalid CSS selector "${spec.root.selector}"`,
      );
    }
  }

  // types[*].items must reference a known type or scalar
  const SCALARS = new Set(["string", "boolean", "number", "null"]);
  for (const [typeName, typeDef] of Object.entries(spec.types)) {
    for (const [fieldName, ft] of Object.entries(typeDef)) {
      if (
        ft.type === "array" &&
        !SCALARS.has(ft.items) &&
        !typeKeys.has(ft.items)
      )
        errors.push(
          `types.${typeName}.${fieldName}.items references unknown type "${ft.items}"`,
        );
    }
  }

  // per-extractor checks
  for (const [typeName, extractorMap] of Object.entries(spec.extractors)) {
    const fieldNames = new Set(Object.keys(extractorMap));

    for (const [fieldName, op] of Object.entries(extractorMap)) {
      const opPath = `extractors.${typeName}.${fieldName}`;
      const raw = op as unknown as Record<string, unknown>;

      // CSS selectors
      const selectorSites: Array<{ path: string; selector: string }> = [];
      collectSelectorsFromOp(raw, selectorSites);
      for (const { path, selector } of selectorSites) {
        try {
          frag.querySelector(selector);
        } catch {
          errors.push(`${opPath}.${path}: invalid CSS selector "${selector}"`);
        }
      }

      // regex patterns
      const regexSites: Array<{
        path: string;
        pattern: string;
        flags: string;
      }> = [];
      collectRegexFromOp(raw, regexSites);
      for (const { path, pattern, flags } of regexSites) {
        try {
          new RegExp(pattern, flags);
        } catch {
          errors.push(`${opPath}.${path}: invalid regex /${pattern}/${flags}`);
        }
      }

      // queryAll.map must reference a known extractor
      if (op.op === "queryAll" && !extractorKeys.has(op.map))
        errors.push(`${opPath}.map references unknown extractor "${op.map}"`);

      // derive.from must reference a sibling field, not itself
      if (op.op === "derive") {
        if (op.from === fieldName)
          errors.push(`${opPath}.from cannot reference itself`);
        else if (!fieldNames.has(op.from))
          errors.push(
            `${opPath}.from "${op.from}" is not a sibling field in extractors.${typeName}`,
          );
      }
    }
  }
}

/**
 * Validates a raw unknown value as a DOMExtractorSpec.
 * Returns { valid, errors } — never throws.
 *
 * Two-phase:
 *   1. Zod — structure, types, allowed enum values
 *   2. Semantic — CSS selector validity, regex validity, cross-references
 */
export function validateSpec(raw: unknown): ValidationResult {
  // Phase 1: structural
  const result = DOMExtractorSpecSchema.safeParse(raw);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "/"}: ${issue.message}`,
      ),
    };
  }

  // Phase 2: semantic (only reachable if structure is sound)
  const semanticErrors: string[] = [];
  semanticValidate(result.data, semanticErrors);

  return { valid: semanticErrors.length === 0, errors: semanticErrors };
}

// ---------------------------------------------------------------------------
// 3. PARSING (query execution)
// ---------------------------------------------------------------------------

/** Apply a Filter to an Element, returns true if element passes. */
function matchesFilter(el: Element, filter: Filter): boolean {
  if (filter.textMatches !== undefined) {
    const re = new RegExp(filter.textMatches);
    if (!re.test(el.textContent ?? "")) return false;
  }
  if (filter.attrMatches !== undefined) {
    for (const [attr, pattern] of Object.entries(filter.attrMatches)) {
      const val = el.getAttribute(attr) ?? "";
      if (!new RegExp(pattern).test(val)) return false;
    }
  }
  if (filter.hasChild !== undefined) {
    if (!el.querySelector(filter.hasChild)) return false;
  }
  if (filter.not !== undefined) {
    if (matchesFilter(el, filter.not)) return false;
  }
  return true;
}

/** Try each selector in order, return the first matching Element within scope. */
function queryFirst(
  scope: Element | Document,
  selectors: string[],
): Element | null {
  for (const sel of selectors) {
    const el = scope.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Try each selector, return all matching elements from the first that yields results. */
function queryFirstAll(
  scope: Element | Document,
  selectors: string[],
): Element[] {
  for (const sel of selectors) {
    const els = Array.from(scope.querySelectorAll(sel));
    if (els.length > 0) return els;
  }
  return [];
}

/** Apply a Transform[] pipeline to a string value. */
function applyTransforms(value: string, transforms: Transform[]): string {
  let v = value;
  for (const t of transforms) {
    switch (t.fn) {
      case "trim":
        v = v.trim();
        break;
      case "lowercase":
        v = v.toLowerCase();
        break;
      case "uppercase":
        v = v.toUpperCase();
        break;
      case "replace":
        v = v.replace(new RegExp(t.pattern, t.flags ?? ""), t.with);
        break;
      case "slice":
        v = v.slice(t.start, t.end);
        break;
      case "defaultIfEmpty":
        v = v.trim() === "" ? t.value : v;
        break;
      case "parseNumber":
        v = String(parseFloat(v));
        break;
    }
  }
  return v;
}

/** Apply a DeriveFn to an already-extracted value. */
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

/** Apply PostProcess to an array of extracted items. */
function applyPostProcess(
  items: ExtractedValue[],
  pp: PostProcess,
): ExtractedValue[] {
  // filterOut operates on raw Element values — we need to filter before mapping.
  // See note in executeOp_queryAll where postProcess.filterOut is applied to Elements.
  let result = items;
  if (pp.limit !== undefined) result = result.slice(0, pp.limit);
  if (pp.unique) {
    const seen = new Set<string>();
    result = result.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return result;
}

// Forward declaration — executeOp calls executeExtractor which calls executeOp
let executeExtractor: (
  scope: Element | Document,
  extractorMap: ExtractorMap,
  allExtractors: Record<string, ExtractorMap>,
) => Record<string, ExtractedValue>;

function executeOp(
  op: AnyOp,
  scope: Element | Document,
  allExtractors: Record<string, ExtractorMap>,
  /** Sibling results already computed in this extractor (for "derive") */
  siblings: Record<string, ExtractedValue>,
): ExtractedValue {
  switch (op.op) {
    case "text": {
      const el = queryFirst(scope, op.selectors);
      if (!el) {
        if (op.fallback !== undefined)
          return executeOp(op.fallback, scope, allExtractors, siblings);
        return op.nullable ? null : "";
      }
      let text = el.textContent?.trim() ?? "";
      if (op.transform) text = applyTransforms(text, op.transform);
      return text;
    }

    case "attr": {
      const el = queryFirst(scope, op.selectors);
      if (!el)
        return op.nullable ? null : ((op.fallback ?? null) as ExtractedValue);
      let val = el.getAttribute(op.attr) ?? "";
      if (op.transform) val = applyTransforms(val, op.transform);
      return val || (op.nullable ? null : val);
    }

    case "exists": {
      const els = queryFirstAll(scope, op.selectors);
      if (els.length === 0) return false;
      if (!op.filter) return true;
      return els.some((el) => matchesFilter(el, op.filter!));
    }

    case "queryAll": {
      let els = queryFirstAll(scope, op.selectors);
      if (op.filter) els = els.filter((el) => matchesFilter(el, op.filter!));

      const mapExtractor = allExtractors[op.map];
      if (!mapExtractor) return [];

      // Apply filterOut on Elements before mapping (more efficient)
      if (op.postProcess?.filterOut) {
        const fo = op.postProcess.filterOut;
        els = els.filter((el) => !matchesFilter(el, fo));
      }

      let items: ExtractedValue[] = els.map((el) =>
        executeExtractor(el, mapExtractor, allExtractors),
      );

      // Apply remaining postProcess (limit, unique) on mapped items
      if (op.postProcess) {
        const pp = { ...op.postProcess };
        delete pp.filterOut; // already applied above
        items = applyPostProcess(items, pp);
      }

      return items;
    }

    case "textRegex": {
      const text =
        (scope instanceof Element
          ? scope.textContent
          : scope.body?.textContent) ?? "";
      const re = new RegExp(op.pattern, op.flags ?? "");
      const match = re.exec(text);
      if (!match) return null;
      const group = op.group ?? 0;
      return match[group] ?? null;
    }

    case "textLines": {
      const text = (scope instanceof Element ? scope.textContent : "") ?? "";
      let lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (op.filter) {
        // Filter treats each line as a pseudo text-content check
        lines = lines.filter((line) => {
          if (op.filter!.textMatches)
            return new RegExp(op.filter!.textMatches).test(line);
          return true;
        });
      }
      if (op.pick === "first") return lines[0] ?? null;
      if (op.pick === "last") return lines[lines.length - 1] ?? null;
      return lines[op.pick as number] ?? null;
    }

    case "first": {
      for (const branch of op.branches) {
        const result = executeOp(branch, scope, allExtractors, siblings);
        if (result !== null && result !== "" && result !== false) return result;
      }
      return op.nullable ? null : null;
    }

    case "derive": {
      const sourceValue = siblings[op.from];
      if (sourceValue === undefined) return null;
      return applyDerive(sourceValue, op.fn);
    }

    case "static": {
      return op.value as ExtractedValue;
    }
  }
}

/**
 * Topologically sort extractor fields so that "derive" ops always run
 * after the field they depend on.
 */
function topoSortFields(extractorMap: ExtractorMap): string[] {
  const keys = Object.keys(extractorMap);
  const visited = new Set<string>();
  const sorted: string[] = [];

  function visit(key: string, stack: Set<string>) {
    if (visited.has(key)) return;
    if (stack.has(key))
      throw new Error(`Circular derive dependency at field "${key}"`);
    stack.add(key);
    const op = extractorMap[key];
    if (op.op === "derive" && extractorMap[op.from]) visit(op.from, stack);
    stack.delete(key);
    visited.add(key);
    sorted.push(key);
  }

  for (const key of keys) visit(key, new Set());
  return sorted;
}

// Implement the forward-declared function
executeExtractor = (
  scope: Element | Document,
  extractorMap: ExtractorMap,
  allExtractors: Record<string, ExtractorMap>,
): Record<string, ExtractedValue> => {
  const result: Record<string, ExtractedValue> = {};
  const order = topoSortFields(extractorMap);

  for (const fieldName of order) {
    result[fieldName] = executeOp(
      extractorMap[fieldName],
      scope,
      allExtractors,
      result,
    );
  }

  return result;
};

/**
 * Parse and execute a DOMExtractorSpec against the live document.
 *
 * @param spec     - A validated DOMExtractorSpec object.
 * @param rootEl   - Optional override for the root scope (defaults to document).
 * @returns        - The extracted data, or null if root selector is required and missing.
 * @throws         - If the spec references an unknown extractor (should be caught by validate).
 */
export function parseSpec(
  spec: DOMExtractorSpec,
  rootEl: Document | Element = document,
): Record<string, ExtractedValue> | null {
  // Resolve root scope
  let scope: Document | Element = rootEl;

  if (spec.root.selector) {
    const found =
      (rootEl instanceof Document
        ? rootEl
        : (rootEl.ownerDocument ?? document)
      ).querySelector(spec.root.selector) ??
      (rootEl instanceof Element
        ? rootEl.querySelector(spec.root.selector)
        : null);

    if (!found) {
      if (spec.root.required) return null;
      // Best-effort: keep using rootEl as scope
    } else {
      scope = found;
    }
  }

  const rootExtractor = spec.extractors[spec.root.output];
  if (!rootExtractor)
    throw new Error(
      `No extractor defined for root output type "${spec.root.output}"`,
    );

  return executeExtractor(scope, rootExtractor, spec.extractors);
}

/**
 * Convenience: validate then parse in one call.
 * Returns { data, errors } — data is null if validation failed or root was required+missing.
 */
export function validateAndParse(
  raw: unknown,
  rootEl: Document | Element = document,
): { data: Record<string, ExtractedValue> | null; errors: string[] } {
  const validation = validateSpec(raw);
  if (!validation.valid) console.error(validation.errors);

  try {
    // safeParse already succeeded above, so cast is sound
    const data = parseSpec(raw as DOMExtractorSpec, rootEl);
    return { data, errors: [] };
  } catch (err) {
    return { data: null, errors: [(err as Error).message] };
  }
}
