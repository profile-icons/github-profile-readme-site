import stylesObj from "../styles.json";

interface StyleI {
  bg: string;
  bgSize?: string;
  bgPos?: string;
}

export type Style =
  | { type: "default" }
  | { type: "named"; name: string; style: StyleI };

const styles = stylesObj as Record<string, StyleI>;

for (const [name, style] of Object.entries(styles)) {
  if (!style?.bg?.trim()) {
    throw new Error(`Theme style "${name}" must define a background.`);
  }
}

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

export const resolveStyle: (val?: string | undefined) => Style = (
  val?: string,
): Style => {
  const styleVal: string = val?.trim() ?? "";
  if (!styleVal) return { type: "default" };

  const style: StyleI | undefined = styles[styleVal];
  if (!style) {
    const availStyles: string = Object.keys(styles).sort().join(", ");
    throw new Error(
      `Unknown style "${styleVal}". Available: ${availStyles || "none"}.`,
    );
  }

  return { type: "named", name: styleVal, style };
};
