import stylesObj from "../styles.json";

interface StyleI {
  bg: string;
  bgSize?: string;
  bgPos?: string;
}

export type Style =
  | { type: "default" }
  | { type: "named"; name: string; style: StyleI }
  | { type: "all"; name: string; style: StyleI; names: string[] };

const styles = stylesObj as Record<string, StyleI>;

for (const [name, style] of Object.entries(styles)) {
  if (!style?.bg?.trim()) {
    throw new Error(`Theme style "${name}" must define a background.`);
  }
}

const sortedStyleNames: string[] = Object.keys(styles).sort(
  (a: string, b: string): number => a.localeCompare(b),
);

export const styleNames: () => string[] = (): string[] => [...sortedStyleNames];

const css: (property: string, val?: string | undefined) => string = (
  property: string,
  val?: string,
): string => (val?.trim() ? `${property}:${val};` : "");

export const styleCSS: (name: string, style: StyleI) => string = (
  name: string,
  style: StyleI,
): string => {
  const nameStr: string = JSON.stringify(name);
  return `html[data-theme-style=${nameStr}] body{${css("background", style.bg)}${css("background-size", style.bgSize)}${css("background-position", style.bgPos)}}`;
};

export const allStylesCSS: (names?: string[]) => string = (
  names: string[] = sortedStyleNames,
): string =>
  names
    .map((name: string): string => {
      const style: StyleI | undefined = styles[name];
      return style ? styleCSS(name, style) : "";
    })
    .join("");

export const resolveStyle: (val?: string | undefined) => Style = (
  val?: string,
): Style => {
  const styleVal: string = val?.trim() ?? "";
  if (!styleVal) return { type: "default" };

  if (styleVal === "all") {
    const names: string[] = styleNames();
    const name: string | undefined = names[0];
    const style: StyleI | undefined = name ? styles[name] : undefined;
    if (!name || !style) {
      throw new Error("Theme style collection is empty.");
    }
    return {
      type: "all",
      name,
      style,
      names,
    };
  }

  const style: StyleI | undefined = styles[styleVal];
  if (!style) {
    const availStyles: string = Object.keys(styles).sort().join(", ");
    throw new Error(
      `Unknown style "${styleVal}". Available: ${availStyles || "none"}.`,
    );
  }

  return { type: "named", name: styleVal, style };
};
