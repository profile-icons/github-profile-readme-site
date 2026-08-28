import rawConfig from "../site.config.json";

export interface SiteConfig {
  githubName: string;
  siteUrl: string;
  repoName?: string;
  basePath: string;
  tagline: string;
  tabName?: string;
  tabSuffix?: string;
  description: string;
  theme: string;
  themeColor?: string;
  style?: string;
  organizations?: string[];
  language: string;
  locales?: string[];
  links: Record<string, string>;
}

export const siteConfig: SiteConfig = rawConfig satisfies SiteConfig;

export const localeSrc: string = siteConfig.language.trim() || "en";
export const locales: string[] = [
  ...new Set(
    [localeSrc, ...(siteConfig.locales ?? [])]
      .map((locale: string): string => locale.trim())
      .filter(Boolean),
  ),
];
for (const locale of locales) {
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }
}

export const githubProfileUrl = `https://github.com/${siteConfig.githubName}`;
export const githubAvatarUrl = `${githubProfileUrl}.png?size=320`;
