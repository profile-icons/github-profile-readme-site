import themeObjs from "../themes.json";

export type ThemeVar = Record<string, string>;

export type ThemeType =
  | { type: "default" }
  | { type: "name"; name: string; light: ThemeVar; dark: ThemeVar };

interface Theme {
  light: ThemeVar;
  dark: ThemeVar;
}

const themes: Record<string, Theme> = themeObjs as Record<string, Theme>;
const varCSS: RegExp = /^--[a-z0-9-]+$/i;

const themeTokens: string[] = [
  "--page-background",
  "--page-glow",
  "--page-text",
  "--details-border",
  "--tagline-text",
  "--focus-ring",
  "--success-text",
  "--toggle-background",
  "--toggle-border",
  "--toggle-text",
  "--toggle-shadow",
  "--link-background",
  "--link-border",
  "--link-text",
  "--link-shadow",
  "--link-hover-background",
  "--link-hover-border",
  "--link-hover-text",
  "--readme-text",
  "--readme-heading",
  "--readme-muted",
  "--readme-link",
  "--readme-link-hover",
  "--readme-border",
  "--readme-blockquote-text",
  "--readme-blockquote-border",
  "--readme-table-row-alt",
  "--readme-kbd-background",
  "--readme-kbd-border",
  "--readme-kbd-text",
  "--readme-mark-background",
  "--code-background",
  "--code-text",
  "--inline-code-background",
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-function",
  "--syntax-entity",
  "--syntax-variable",
  "--syntax-tag",
] as const;

const assertTheme: (name: string, variant: ThemeVar) => void = (
  name: string,
  variant: ThemeVar,
): void => {
  for (const [property, val] of Object.entries(variant)) {
    if (!varCSS.test(property) || !val.trim()) {
      throw new Error(
        `Invalid ${variant} token in theme "${name}": ${property}`,
      );
    }
  }

  const missingTokens: string[] = themeTokens.filter(
    (token: string): boolean => !variant[token]?.trim(),
  );
  if (missingTokens.length) {
    throw new Error(
      `Theme "${name}" ${variant} variant is missing required tokens: ${missingTokens.join(", ")}`,
    );
  }
};

for (const [themeName, theme] of Object.entries(themes)) {
  if (!theme?.light || !theme?.dark) {
    throw new Error(`Theme "${themeName}" must have light and dark variants.`);
  }
  assertTheme(themeName, theme.light);
  assertTheme(themeName, theme.dark);

  const tokensLight: string = Object.keys(theme.light).sort().join("|");
  const tokensDark: string = Object.keys(theme.dark).sort().join("|");
  if (tokensLight !== tokensDark) {
    throw new Error(
      `Theme "${themeName}" must define the same tokens in light and dark variants.`,
    );
  }
}

const parseHex: (val: string) => [number, number, number] | undefined = (
  val: string,
): [number, number, number] | undefined => {
  const match: RegExpExecArray | null =
    /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(val);
  if (!match) return undefined;

  const hex: string =
    match[1].length === 3 || match[1].length === 4
      ? [...match[1]]
          .map((digit: string): string => `${digit}${digit}`)
          .join("")
      : match[1];

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
};

const parseChannelRGB: (val: string) => number | undefined = (
  val: string,
): number | undefined => {
  const channel: string = val.trim();
  const isPercent: boolean = channel.endsWith("%");
  const numVal: number = Number.parseFloat(
    isPercent ? channel.slice(0, -1) : channel,
  );
  if (!Number.isFinite(numVal)) return undefined;
  if (isPercent) {
    if (numVal < 0 || numVal > 100) return undefined;
    return (numVal / 100) * 255;
  }
  if (numVal < 0 || numVal > 255) return undefined;
  return numVal;
};

const isValidAlpha: (val?: string | undefined) => boolean = (
  val?: string,
): boolean => {
  if (val === undefined) return true;
  const alpha: string = val.trim();
  const isPercent: boolean = alpha.endsWith("%");
  const numVal: number = Number.parseFloat(
    isPercent ? alpha.slice(0, -1) : alpha,
  );
  if (!Number.isFinite(numVal)) return false;
  return isPercent ? numVal >= 0 && numVal <= 100 : numVal >= 0 && numVal <= 1;
};

const parseRGB: (val: string) => [number, number, number] | undefined = (
  val: string,
): [number, number, number] | undefined => {
  const match: RegExpExecArray | null = /^rgba?\((.*)\)$/i.exec(val);
  if (!match) return undefined;

  const body: string = match[1].trim();
  let channels: string[];
  let alpha: string | undefined;

  if (body.includes(",")) {
    const parts: string[] = body
      .split(",")
      .map((part: string): string => part.trim());
    if (parts.length !== 3 && parts.length !== 4) return undefined;
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const slashParts: string[] = body
      .split("/")
      .map((part: string): string => part.trim());
    if (slashParts.length > 2) return undefined;
    channels = slashParts[0].split(/\s+/).filter(Boolean);
    alpha = slashParts[1];
  }

  if (channels.length !== 3 || !isValidAlpha(alpha)) return undefined;
  const parsed: (number | undefined)[] = channels.map(parseChannelRGB);
  if (
    parsed.some((channel: number | undefined): boolean => channel === undefined)
  )
    return undefined;
  return parsed as [number, number, number];
};

const parseThemeColor: (val: string) => [number, number, number] | undefined = (
  val: string,
): [number, number, number] | undefined => parseHex(val) ?? parseRGB(val);

const relLuminance: ([r, g, b]: [number, number, number]) => number = ([
  r,
  g,
  b,
]: [number, number, number]): number => {
  const linear: number[] = [r, g, b].map((channel: number): number => {
    const val: number = channel / 255;
    return val <= 0.04045 ? val / 12.92 : ((val + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

export const isThemeColor: (val: string) => boolean = (val: string): boolean =>
  parseThemeColor(val.trim()) !== undefined;

export const resolveThemeColor: (
  val?: string | undefined,
) => string | undefined = (val?: string): string | undefined => {
  const themeColor: string = val?.trim() ?? "";
  if (!themeColor) return undefined;

  if (!isThemeColor(themeColor)) {
    throw new Error(
      `Invalid themeColor "${themeColor}". Use a HEX or RGB color.`,
    );
  }

  return themeColor;
};

export const themeColorTone: (val: string) => "light" | "dark" = (
  val: string,
): "light" | "dark" => {
  const rgb: [number, number, number] | undefined = parseThemeColor(val.trim());
  if (!rgb) {
    throw new Error(`Invalid RGB/HEX theme color: ${val}`);
  }
  return relLuminance(rgb) < 0.179 ? "dark" : "light";
};

export const resolveTheme: (val?: string | undefined) => ThemeType = (
  val?: string,
): ThemeType => {
  const themeVal: string = val?.trim() ?? "";
  if (!themeVal) return { type: "default" };

  if (isThemeColor(themeVal)) {
    throw new Error(
      `Theme "${themeVal}" is a color. Put HEX/RGB colors in "themeColor" instead.`,
    );
  }

  const theme: Theme | undefined = themes[themeVal];
  if (!theme) {
    const availableThemes: string = Object.keys(themes).sort().join(", ");
    throw new Error(
      `Unknown theme "${themeVal}". Available themes: ${availableThemes || "none"}.`,
    );
  }

  return {
    type: "name",
    name: themeVal,
    light: theme.light,
    dark: theme.dark,
  };
};

const variantCSS: (variant: ThemeVar) => string = (variant: ThemeVar): string =>
  Object.entries(variant)
    .map(([property, val]: [string, string]): string => `${property}:${val};`)
    .join("");

export const themeCSS: (
  name: string,
  light: ThemeVar,
  dark: ThemeVar,
) => string = (name: string, light: ThemeVar, dark: ThemeVar): string => {
  const nameStr: string = JSON.stringify(name);
  return `html[data-site-theme=${nameStr}]{${variantCSS(light)}}html[data-site-theme=${nameStr}].dark{${variantCSS(dark)}}`;
};

export const themeColorCSS: (
  col: string,
  mode: "light" | "dark",
  isTrans: boolean,
) => string = (
  col: string,
  mode: "light" | "dark",
  isTrans: boolean,
): string => {
  const foreground: "#ffffff" | "#000000" =
    mode === "dark" ? "#ffffff" : "#000000";
  const syntax =
    mode === "dark"
      ? {
          comment: "#d1d5db",
          keyword: "#ff9b94",
          string: "#b9dcff",
          function: "#dfbaff",
          entity: "#ffc078",
          variable: "#9bd0ff",
          tag: "#9aefad",
        }
      : {
          comment: "#4b5563",
          keyword: "#b4232f",
          string: "#063b78",
          function: "#6f42c1",
          entity: "#7c2d12",
          variable: "#034ea2",
          tag: "#0f5d2f",
        };

  return [
    `--page-background:${col}`,
    `--page-glow:${isTrans ? "transparent" : `color-mix(in srgb, ${foreground} 12%, transparent)`}`,
    `--page-text:${foreground}`,
    `--details-border:color-mix(in srgb, ${foreground} 28%, transparent)`,
    `--tagline-text:color-mix(in srgb, ${foreground} 76%, transparent)`,
    `--focus-ring:color-mix(in srgb, ${foreground} 42%, transparent)`,
    `--success-text:${mode === "dark" ? "#7ee787" : "#116329"}`,
    `--toggle-background:color-mix(in srgb, ${col} 82%, ${foreground} 18%)`,
    `--toggle-border:color-mix(in srgb, ${foreground} 30%, transparent)`,
    `--toggle-text:${foreground}`,
    `--toggle-shadow:0 8px 24px rgb(0 0 0 / 0.22)`,
    `--link-background:color-mix(in srgb, ${col} 86%, ${foreground} 14%)`,
    `--link-border:color-mix(in srgb, ${foreground} 28%, transparent)`,
    `--link-text:${foreground}`,
    `--link-shadow:0 4px 12px rgb(0 0 0 / 0.18)`,
    `--link-hover-background:color-mix(in srgb, ${col} 72%, ${foreground} 28%)`,
    `--link-hover-border:color-mix(in srgb, ${foreground} 55%, transparent)`,
    `--link-hover-text:${foreground}`,
    `--readme-text:${foreground}`,
    `--readme-heading:${foreground}`,
    `--readme-muted:color-mix(in srgb, ${foreground} 72%, transparent)`,
    `--readme-link:${foreground}`,
    `--readme-link-hover:${foreground}`,
    `--readme-border:color-mix(in srgb, ${foreground} 28%, transparent)`,
    `--readme-blockquote-text:color-mix(in srgb, ${foreground} 76%, transparent)`,
    `--readme-blockquote-border:color-mix(in srgb, ${foreground} 38%, transparent)`,
    `--readme-table-row-alt:color-mix(in srgb, ${foreground} 7%, transparent)`,
    `--readme-kbd-background:color-mix(in srgb, ${foreground} 10%, transparent)`,
    `--readme-kbd-border:color-mix(in srgb, ${foreground} 30%, transparent)`,
    `--readme-kbd-text:${foreground}`,
    `--readme-mark-background:color-mix(in srgb, ${foreground} 20%, transparent)`,
    `--code-background:color-mix(in srgb, ${col} 88%, ${foreground} 12%)`,
    `--code-text:${foreground}`,
    `--inline-code-background:color-mix(in srgb, ${foreground} 12%, transparent)`,
    `--syntax-comment:${syntax.comment}`,
    `--syntax-keyword:${syntax.keyword}`,
    `--syntax-string:${syntax.string}`,
    `--syntax-function:${syntax.function}`,
    `--syntax-entity:${syntax.entity}`,
    `--syntax-variable:${syntax.variable}`,
    `--syntax-tag:${syntax.tag}`,
  ].join(";");
};

export const themeAccentCSS: (col: string) => string = (col: string): string =>
  [
    `--focus-ring:color-mix(in srgb, ${col} 55%, transparent)`,
    `--toggle-background:color-mix(in srgb, ${col} 10%, var(--page-background))`,
    `--toggle-border:color-mix(in srgb, ${col} 52%, var(--details-border))`,
    `--toggle-text:color-mix(in srgb, ${col} 72%, var(--page-text))`,
    `--link-background:color-mix(in srgb, ${col} 10%, var(--page-background))`,
    `--link-border:color-mix(in srgb, ${col} 48%, var(--details-border))`,
    `--link-text:color-mix(in srgb, ${col} 72%, var(--page-text))`,
    `--link-hover-background:color-mix(in srgb, ${col} 18%, var(--page-background))`,
    `--link-hover-border:${col}`,
    `--link-hover-text:color-mix(in srgb, ${col} 86%, var(--page-text))`,
    `--readme-link:color-mix(in srgb, ${col} 78%, var(--page-text))`,
    `--readme-link-hover:color-mix(in srgb, ${col} 90%, var(--page-text))`,
    `--readme-blockquote-border:color-mix(in srgb, ${col} 52%, var(--readme-border))`,
    `--readme-mark-background:color-mix(in srgb, ${col} 24%, transparent)`,
  ].join(";");

export const themeBG: (variant: ThemeVar) => string | undefined = (
  variant: ThemeVar,
): string | undefined => variant["--page-background"]?.trim() || undefined;
