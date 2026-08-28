import { marked } from "marked";

export const GH_API_V: string = "2026-03-10";

export interface ReadmeSrc {
  owner: string;
  repoName: string;
  readmeDir: string;
}

export interface ReadmeRes extends ReadmeSrc {
  html: string;
  isSuccess: boolean;
}

export interface GitHubOrg {
  login: string;
  avatarUrl: string;
  profileUrl: string;
}

function stripPerms(header: string): string {
  return header.replace(
    /<a\b[^>]*\bclass\s*=\s*(["'])[^"']*\banchor\b[^"']*\1[^>]*>[\s\S]*?<\/a>/gi,
    "",
  );
}

function normHeadMD(html: string): string {
  const normHtml: string = html.replace(
    /<div\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bmarkdown-heading\b[^"']*\1)[^>]*>([\s\S]*?)<\/div>/i,
    (wrapper: string): string => {
      const headMD: string | undefined = wrapper.match(
        /<h1\b[^>]*>[\s\S]*?<\/h1>/i,
      )?.[0];
      return headMD ? stripPerms(headMD) : wrapper;
    },
  );
  return normHtml
    .replace(
      /<h1\b([^>]*)>([\s\S]*?)<\/h1>/i,
      (_match: string, attrs: string, contents: string): string =>
        `<h1${attrs}>${stripPerms(contents)}</h1>`,
    )
    .replace(
      /(<h1\b[^>]*>[\s\S]*?<\/h1>)\s*<a\b[^>]*\bclass\s*=\s*(["'])[^"']*\banchor\b[^"']*\2[^>]*>[\s\S]*?<\/a>/i,
      "$1",
    );
}

function formatTag(html: string, tag: "h1" | "p", cls: string): string {
  return html.replace(
    new RegExp(`<${tag}\\b([^>]*)>`, "i"),
    (_openingTag: string, attrs: string): string => {
      const clsPattern = /\sclass\s*=\s*(["'])(.*?)\1/i;
      if (!clsPattern.test(attrs)) {
        return `<${tag}${attrs} ` + `class="${cls}">`;
      }
      const updated: string = attrs.replace(
        clsPattern,
        (_match: string, quote: string, existingCls: string): string => {
          const clsArr: string[] = existingCls.split(/\s+/).filter(Boolean);
          if (!clsArr.includes(cls)) {
            clsArr.push(cls);
          }
          return ` class=${quote}${clsArr.join(" ")}${quote}`;
        },
      );
      return `<${tag}${updated}>`;
    },
  );
}

function formatAttr(
  html: string,
  tagPat: string,
  attr: string,
  baseUrl: string,
): string {
  return html.replace(
    new RegExp(
      `(<(?:${tagPat})\\b[^>]*?\\s` + `${attr}\\s*=\\s*)(["'])(.*?)\\2`,
      "gi",
    ),
    (_match: string, prefix: string, quote: string, url: string): string =>
      `${prefix}${quote}` + `${formatRelUrl(url, baseUrl)}` + `${quote}`,
  );
}

function formatRelUrl(url: string, baseUrl: string): string {
  const trimUrl: string = url.trim();
  if (!trimUrl || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(trimUrl)) {
    return url;
  } else if (trimUrl.startsWith("/")) {
    return `https://github.com${trimUrl}`;
  }
  try {
    return new URL(trimUrl, baseUrl).href;
  } catch {
    return url;
  }
}

function formatSrcset(html: string, baseUrl: string): string {
  return html.replace(
    /(<(?:img|source)\b[^>]*?\ssrcset\s*=\s*)(["'])(.*?)\2/gi,
    (_match: string, prefix: string, quote: string, val: string): string => {
      if (val.trim().startsWith("data:")) {
        return `${prefix}${quote}${val}${quote}`;
      }
      const formatVal: string = val
        .split(",")
        .map((str: string): string => {
          const [url = "", desc] = str.trim().split(/\s+/, 2);
          const res: string = formatRelUrl(url, baseUrl);
          return desc ? `${res} ${desc}` : res;
        })
        .join(", ");
      return `${prefix}${quote}${formatVal}${quote}`;
    },
  );
}

function escHtml(str: string): string {
  return str.replace(
    /[&<>"']/g,
    (char: string): string =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char] ?? char,
  );
}

function failRes(src: ReadmeSrc, msg: string): ReadmeRes {
  console.warn(`[GitHub README] ${msg}`);
  const htmlFB: string = `
    <h1>${escHtml(src.owner)}</h1>
    <p>The profile README could not be loaded.</p>
    <p><a href="https://github.com/${encodeURIComponent(src.owner)}/${encodeURIComponent(src.repoName)}">Open the GitHub repository</a></p>
  `;
  return {
    ...src,
    html: htmlFB,
    isSuccess: false,
  };
}

async function fetchDefBranch(
  src: ReadmeSrc,
  headers: Record<string, string>,
): Promise<string> {
  try {
    const res: Response = await fetch(urlRepoAPI(src), {
      headers: {
        ...headers,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      return "HEAD";
    }

    const repo = (await res.json()) as {
      default_branch?: unknown;
    };
    const branch: unknown = repo.default_branch;
    return typeof branch === "string" && branch.trim() ? branch : "HEAD";
  } catch {
    return "HEAD";
  }
}

function getHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": GH_API_V,
    "User-Agent": "github-profile-readme-site",
  };
  const gh_token: string | undefined = process.env.GITHUB_TOKEN?.trim();
  if (gh_token) {
    headers.Authorization = `Bearer ${gh_token}`;
  }
  return headers;
}

function urlUserAPI(username: string): string {
  return `https://api.github.com/users/${encodeURIComponent(username)}`;
}

function urlOrgAPI(org: string): string {
  return `https://api.github.com/orgs/${encodeURIComponent(org)}`;
}

function urlRepoAPI(src: ReadmeSrc, path = ""): string {
  return (
    "https://api.github.com/repos/" +
    `${encodeURIComponent(src.owner)}/${encodeURIComponent(src.repoName)}${path}`
  );
}

async function isOrg(
  username: string,
  headers: Record<string, string>,
): Promise<boolean | undefined> {
  try {
    const res: Response = await fetch(urlUserAPI(username), {
      headers: {
        ...headers,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return undefined;
    const account = (await res.json()) as { type?: unknown };
    return account.type === "Organization";
  } catch {
    return undefined;
  }
}

export async function fetchOrgs(orgNames: string[]): Promise<GitHubOrg[]> {
  const orgs: string[] = [
    ...new Set(
      orgNames
        .map((org: string): string => org.trim().replace(/^@+/, ""))
        .filter(Boolean),
    ),
  ];
  if (orgs.length === 0) return [];

  const headers: Record<string, string> = getHeaders(
    "application/vnd.github+json",
  );

  const results: Array<GitHubOrg | undefined> = await Promise.all(
    orgs.map(async (org: string): Promise<GitHubOrg | undefined> => {
      try {
        const res: Response = await fetch(urlOrgAPI(org), {
          headers,
        });
        if (res.status === 404) {
          console.warn(
            `[GitHub organization] @${org} was not found or is not public.`,
          );
          return undefined;
        }
        if (!res.ok) {
          console.warn(
            `[GitHub organization] @${org}: GitHub API returned ${res.status} ${res.statusText}.`,
          );
          return undefined;
        }

        const orgObj = (await res.json()) as {
          login?: unknown;
          avatar_url?: unknown;
          html_url?: unknown;
        };
        if (
          typeof orgObj.login !== "string" ||
          !orgObj.login.trim() ||
          typeof orgObj.avatar_url !== "string" ||
          !orgObj.avatar_url.trim()
        ) {
          console.warn(
            `[GitHub organization] @${org} returned incomplete profile data.`,
          );
          return undefined;
        }

        const login: string = orgObj.login.trim();
        const profileUrl: string =
          typeof orgObj.html_url === "string" && orgObj.html_url.trim()
            ? orgObj.html_url.trim()
            : `https://github.com/${encodeURIComponent(login)}`;

        return {
          login,
          avatarUrl: orgObj.avatar_url.trim(),
          profileUrl,
        };
      } catch (error) {
        const msg: string =
          error instanceof Error ? error.message : "Unknown network error.";
        console.warn(`[GitHub organization] @${org}: ${msg}`);
        return undefined;
      }
    }),
  );

  return results.filter(
    (org: GitHubOrg | undefined): org is GitHubOrg => org !== undefined,
  );
}

function encPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part: string): string => encodeURIComponent(part))
    .join("/");
}

function optImg(html: string): string {
  let imgIdx = 0;

  return html.replace(/<img\b([^>]*)>/gi, (_tag: string, attrs: string) => {
    const isFirst = imgIdx++ === 0;

    let output = `<img${attrs}>`;
    if (!/\bdecoding\s*=/i.test(output)) {
      output = output.replace(/>$/, ' decoding="async">');
    }

    if (!/\bloading\s*=/i.test(output)) {
      output = output.replace(
        />$/,
        isFirst ? ' loading="eager">' : ' loading="lazy">',
      );
    }

    if (isFirst && !/\bfetchpriority\s*=/i.test(output)) {
      output = output.replace(/>$/, ' fetchpriority="high">');
    }
    return output;
  });
}

function fmtUrls(html: string, src: ReadmeSrc, defBranch: string): string {
  const encOwner: string = encodeURIComponent(src.owner);
  const encRepo: string = encodeURIComponent(src.repoName);
  const encBranch: string = encodeURIComponent(defBranch);
  const encDir: string = encPath(src.readmeDir);

  const rawUrl: string =
    `https://raw.githubusercontent.com/` +
    `${encOwner}/${encRepo}/${encBranch}/${encDir ? `${encDir}/` : ""}`;
  const res: string = formatAttr(
    formatAttr(html, "img|source|video|audio|track|input", "src", rawUrl),
    "img|source",
    "data-canonical-src",
    rawUrl,
  );
  const blobUrl: string =
    `https://github.com/` +
    `${encOwner}/${encRepo}/blob/${encBranch}/${encDir ? `${encDir}/` : ""}`;
  return formatAttr(formatSrcset(res, rawUrl), "a|area", "href", blobUrl);
}

export async function getReadMeSrc(
  username: string,
  repoName: string | undefined,
  headers: Record<string, string> = getHeaders("application/vnd.github+json"),
): Promise<ReadmeSrc> {
  const owner: string = username.trim();
  const reqRepo: string = String(repoName ?? "").trim();

  if (!owner) throw new Error("githubName is required.");
  if (reqRepo.includes("/")) {
    throw new Error(
      "repoName must be only be the repository in owner/repository.",
    );
  }

  const isOrgProfile: boolean | undefined =
    !reqRepo || reqRepo === ".github" ? await isOrg(owner, headers) : false;
  repoName = reqRepo || (isOrgProfile === true ? ".github" : owner);
  const readmeDir: string =
    repoName === ".github" && isOrgProfile !== false ? "profile" : "";
  return { owner, repoName, readmeDir };
}

export async function fetchReadMe(
  username: string,
  repoName?: string,
): Promise<ReadmeRes> {
  const headers: Record<string, string> = getHeaders(
    "application/vnd.github.raw+json",
  );
  let src: ReadmeSrc = {
    owner: username.trim(),
    repoName: String(repoName ?? "").trim() || username.trim(),
    readmeDir: String(repoName ?? "").trim() === ".github" ? "profile" : "",
  };

  try {
    src = await getReadMeSrc(username, repoName, headers);
    const [res, defBranch] = await Promise.all([
      fetch(
        urlRepoAPI(
          src,
          src.readmeDir ? `/readme/${encPath(src.readmeDir)}` : "/readme",
        ),
        { headers },
      ),
      fetchDefBranch(src, headers),
    ]);
    if (!res.ok) {
      return failRes(
        src,
        `GitHub API returned ${res.status} ` +
          `${res.statusText}. Confirm that ${src.owner}/${src.repoName}/${src.readmeDir ? `${src.readmeDir}/` : ""}README.md is public.`,
      );
    }

    const md: string = await res.text();
    const renderedMD: string = await marked.parse(md, {
      gfm: true,
      breaks: false,
    });

    const html: string = optImg(
      fmtUrls(
        formatTag(
          formatTag(normHeadMD(renderedMD), "h1", "readme-title"),
          "p",
          "readme-intro",
        ),
        src,
        defBranch,
      ),
    );
    return {
      ...src,
      html,
      isSuccess: true,
    };
  } catch (error) {
    const msg: string =
      error instanceof Error
        ? error.message
        : "An unknown network error occurred.";
    return failRes(src, msg);
  }
}
