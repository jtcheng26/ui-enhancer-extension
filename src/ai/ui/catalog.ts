import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";

// ---------------------------------------------------------------------------
// Catalog: definitions (schema-level)
// ---------------------------------------------------------------------------

export const catalog = defineCatalog(schema, {
  components: {
    Card: shadcnComponentDefinitions.Card,
    Stack: shadcnComponentDefinitions.Stack,
    Grid: shadcnComponentDefinitions.Grid,
    Separator: shadcnComponentDefinitions.Separator,
    Tabs: shadcnComponentDefinitions.Tabs,
    Accordion: shadcnComponentDefinitions.Accordion,
    Collapsible: shadcnComponentDefinitions.Collapsible,
    Dialog: shadcnComponentDefinitions.Dialog,
    Drawer: shadcnComponentDefinitions.Drawer,
    Carousel: shadcnComponentDefinitions.Carousel,
    Table: shadcnComponentDefinitions.Table,

    Heading: shadcnComponentDefinitions.Heading,
    Text: shadcnComponentDefinitions.Text,
    Image: shadcnComponentDefinitions.Image,

    Avatar: shadcnComponentDefinitions.Avatar,
    Badge: shadcnComponentDefinitions.Badge,
    Alert: shadcnComponentDefinitions.Alert,
    Progress: shadcnComponentDefinitions.Progress,
    Skeleton: shadcnComponentDefinitions.Skeleton,
    Spinner: shadcnComponentDefinitions.Spinner,

    Tooltip: shadcnComponentDefinitions.Tooltip,
    Popover: shadcnComponentDefinitions.Popover,

    Input: shadcnComponentDefinitions.Input,
    Textarea: shadcnComponentDefinitions.Textarea,
    Select: shadcnComponentDefinitions.Select,
    Checkbox: shadcnComponentDefinitions.Checkbox,
    Radio: shadcnComponentDefinitions.Radio,
    Switch: shadcnComponentDefinitions.Switch,
    Slider: shadcnComponentDefinitions.Slider,

    Button: shadcnComponentDefinitions.Button,
    Link: shadcnComponentDefinitions.Link,
    DropdownMenu: shadcnComponentDefinitions.DropdownMenu,

    Toggle: shadcnComponentDefinitions.Toggle,
    ToggleGroup: shadcnComponentDefinitions.ToggleGroup,
    ButtonGroup: shadcnComponentDefinitions.ButtonGroup,

    Pagination: shadcnComponentDefinitions.Pagination,
  },
  actions: {},
});

// ---------------------------------------------------------------------------
// Registry: runtime implementations
// ---------------------------------------------------------------------------

export const { registry } = defineRegistry(catalog, {
  components: {
    Card: shadcnComponents.Card,
    Stack: shadcnComponents.Stack,
    Grid: shadcnComponents.Grid,
    Separator: shadcnComponents.Separator,
    Tabs: shadcnComponents.Tabs,
    Accordion: shadcnComponents.Accordion,
    Collapsible: shadcnComponents.Collapsible,
    Dialog: shadcnComponents.Dialog,
    Drawer: shadcnComponents.Drawer,
    Carousel: shadcnComponents.Carousel,
    Table: shadcnComponents.Table,

    Heading: shadcnComponents.Heading,
    Text: shadcnComponents.Text,
    Image: shadcnComponents.Image,

    Avatar: shadcnComponents.Avatar,
    Badge: shadcnComponents.Badge,
    Alert: shadcnComponents.Alert,
    Progress: shadcnComponents.Progress,
    Skeleton: shadcnComponents.Skeleton,
    Spinner: shadcnComponents.Spinner,

    Tooltip: shadcnComponents.Tooltip,
    Popover: shadcnComponents.Popover,

    Input: shadcnComponents.Input,
    Textarea: shadcnComponents.Textarea,
    Select: shadcnComponents.Select,
    Checkbox: shadcnComponents.Checkbox,
    Radio: shadcnComponents.Radio,
    Switch: shadcnComponents.Switch,
    Slider: shadcnComponents.Slider,

    Button: shadcnComponents.Button,
    Link: shadcnComponents.Link,
    DropdownMenu: shadcnComponents.DropdownMenu,

    Toggle: shadcnComponents.Toggle,
    ToggleGroup: shadcnComponents.ToggleGroup,
    ButtonGroup: shadcnComponents.ButtonGroup,

    Pagination: shadcnComponents.Pagination,
  },
});
