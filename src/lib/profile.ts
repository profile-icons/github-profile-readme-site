import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { siteConfig } from "../config";

export interface ReadmeMD {
  html: string;
  isSuccess: boolean;
}

interface Profile {
  locale: string;
  localeSrc: string;
  srcHash: string;
  tabSuffix: string;
  tagline: string;
  readme: ReadmeMD;
}

export interface ProfileTrans {
  readme: ReadmeMD;
  tagline: string;
  title: string;
}

const DEFAULT_TAB_SUFFIX: string = "GitHub Profile";

const genDir: string = resolve(
  process.cwd(),
  process.env.I18N_OUTPUT_DIR?.trim() || "src/gen/i18n",
);
const profileTrans = new Map<string, Promise<ProfileTrans>>();

function localeNorm(locale: string): string {
  return String(locale ?? "")
    .trim()
    .replaceAll("_", "-");
}

function localeKey(locale: string): string {
  const norm: string = localeNorm(locale);
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(norm)) {
    throw new Error(`Invalid locale: ${locale}`);
  }
  return norm;
}

async function readGenDoc(locale: string): Promise<Profile> {
  const norm: string = localeKey(locale);
  const path: string = resolve(genDir, `${locale}.json`);

  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Generated translation file is invalid: ${path}`);
    }

    const profile = parsed as Partial<Profile>;
    if (
      typeof profile.locale !== "string" ||
      typeof profile.localeSrc !== "string" ||
      typeof profile.srcHash !== "string" ||
      typeof profile.tabSuffix !== "string" ||
      typeof profile.tagline !== "string" ||
      !profile.readme ||
      typeof profile.readme !== "object" ||
      typeof profile.readme.html !== "string" ||
      typeof profile.readme.isSuccess !== "boolean"
    ) {
      throw new Error(`Generated translation file is invalid: ${path}`);
    }
    return profile as Profile;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(
        `Missing profile content for ${norm}. Run: npm run i18n.`,
        { cause: error },
      );
    }
    throw error;
  }
}

export function getTranslations(locale: string): Promise<ProfileTrans> {
  const norm: string = localeKey(locale);
  const cached: Promise<ProfileTrans> | undefined = profileTrans.get(norm);
  if (cached) return cached;

  const content: Promise<ProfileTrans> = readGenDoc(norm).then(
    (gen: Profile): ProfileTrans => ({
      title:
        `${siteConfig.tabName || siteConfig.githubName}` +
        ` — ${gen.tabSuffix || DEFAULT_TAB_SUFFIX}`,
      tagline: gen.tagline,
      readme: gen.readme,
    }),
  );

  profileTrans.set(norm, content);
  return content;
}
