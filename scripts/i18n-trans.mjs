import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import emojiRegex from "emoji-regex";
import { fetchReadMe } from "../src/lib/gh.ts";
import { transHTML } from "./i18n-profile.mjs";
import { assertModel, HF_MODEL } from "./i18n-setup.mjs";

const PATTERN_MODEL_TXT = /[\p{L}\p{N}]/u;
const TAB_SUFFIX = "GitHub Profile";

const GEN_DIR = resolve(
  process.cwd(),
  process.env.I18N_OUTPUT_DIR?.trim() || "src/gen/i18n",
);
const PUB_DIR = resolve(
  process.cwd(),
  process.env.I18N_PUBLIC_DIR?.trim() || "public/i18n",
);
const MODEL_ID = process.env.HF_TRANS_MODEL?.trim() || HF_MODEL;
const MODEL_DTYPE = process.env.HF_TRANS_DTYPE?.trim() || "q8";
const MODEL_TASK = process.env.HF_TRANS_TASK?.trim() || "translation";
const MODEL_CACHE_DIR = resolve(
  process.cwd(),
  process.env.HF_TRANSFORMERS_CACHE?.trim() || ".cache/huggingface",
);
const MODEL_LOCALE_MAP = Object.freeze(
  JSON.parse(
    await readFile(new URL("../src/locales.json", import.meta.url), "utf8"),
  ),
);
const MODEL_LOCALE_IDX = new Map(
  Object.entries(MODEL_LOCALE_MAP).map(([locale, modelLocale]) => [
    localeNorm(locale).toLowerCase(),
    modelLocale,
  ]),
);
const MODEL_LOCALE_MAP_HASH = createHash("sha256")
  .update(JSON.stringify(MODEL_LOCALE_MAP))
  .digest("hex")
  .slice(0, 16);
const MODEL_META = Object.freeze({
  provider: "transformers.js",
  model: MODEL_ID,
  dtype: MODEL_DTYPE,
  task: MODEL_TASK,
  emoji: "preserve",
  localeMap: MODEL_LOCALE_MAP_HASH,
});

const MAX_SEG_CHARS = Math.max(
  80,
  Number.parseInt(process.env.HF_TRANS_MAX_CHARS || "320", 10) || 320,
);
const MAX_NEW_TOKENS = Math.max(
  32,
  Number.parseInt(process.env.HF_TRANS_MAX_NEW_TOKENS || "384", 10) || 384,
);

const HTML_ESC = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

const SENTENCE_SEGMENTER = (() => {
  try {
    return new Intl.Segmenter(undefined, { granularity: "sentence" });
  } catch {
    return undefined;
  }
})();

const HTML_MAP = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["copy", "©"],
  ["gt", ">"],
  ["hellip", "…"],
  ["laquo", "«"],
  ["ldquo", "“"],
  ["lsquo", "‘"],
  ["lt", "<"],
  ["mdash", "—"],
  ["nbsp", "\u00a0"],
  ["ndash", "–"],
  ["quot", '"'],
  ["raquo", "»"],
  ["rdquo", "”"],
  ["reg", "®"],
  ["rsquo", "’"],
  ["trade", "™"],
]);

function decodeHTML(value) {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi,
    (match, dec, hexDec, named) => {
      if (!dec && !hexDec) {
        return HTML_MAP.get(String(named).toLowerCase()) ?? match;
      }
      const codePnt = Number.parseInt(dec ? dec : hexDec, dec ? 10 : 16);
      return Number.isSafeInteger(codePnt) &&
        codePnt >= 0 &&
        codePnt <= 0x10ffff
        ? String.fromCodePoint(codePnt)
        : match;
    },
  );
}

function splitTxt(str) {
  if (str.length <= MAX_SEG_CHARS) return [str];

  const strSeg = SENTENCE_SEGMENTER
    ? Array.from(SENTENCE_SEGMENTER.segment(str), ({ seg }) => seg)
    : str.split(/(?<=[.!?])\s+/u);

  const chunks = [];
  let cur = "";

  const pushCur = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };

  for (const line of strSeg) {
    if (!line) continue;
    if (line.length <= MAX_SEG_CHARS) {
      if (cur && cur.length + line.length > MAX_SEG_CHARS) {
        pushCur();
      }
      cur += line;
      continue;
    }

    pushCur();
    const words = line.split(/(\s+)/u);
    for (const word of words) {
      if (cur && cur.length + word.length > MAX_SEG_CHARS) {
        pushCur();
      }
      if (word.length <= MAX_SEG_CHARS) {
        cur += word;
      } else {
        for (let offset = 0; offset < word.length; offset += MAX_SEG_CHARS) {
          chunks.push(word.slice(offset, offset + MAX_SEG_CHARS));
        }
      }
    }
  }

  pushCur();
  return chunks.length ? chunks : [str];
}

function langModel(locale) {
  let candidateLocale = localeNorm(locale).toLowerCase();
  while (candidateLocale) {
    const modelLocale = MODEL_LOCALE_IDX.get(candidateLocale);
    if (typeof modelLocale === "string" && modelLocale) return modelLocale;

    const splitAt = candidateLocale.lastIndexOf("-");
    if (splitAt < 0) break;
    candidateLocale = candidateLocale.slice(0, splitAt);
  }

  throw new Error(
    `Unsupported translation locale: ${locale}. Use a locale key from src/i18n-locales.json.`,
  );
}

function isWordsRepeat(value) {
  const words = String(value ?? "")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!words || words.length < 3) return false;

  for (
    let size = 1;
    size <= Math.min(4, Math.floor(words.length / 3));
    size += 1
  ) {
    for (let i = 0; i + size * 3 <= words.length; i += 1) {
      let repeatCnt = 1;
      while (i + size * (repeatCnt + 1) <= words.length) {
        let isDup = true;
        for (let j = 0; j < size; j += 1) {
          if (words[i + j] !== words[i + size * repeatCnt + j]) {
            isDup = false;
            break;
          }
        }
        if (!isDup) break;
        repeatCnt += 1;
      }
      if (repeatCnt >= 3) return true;
    }
  }

  return false;
}

function isCharsRepeat(value) {
  const chars = Array.from(String(value ?? "").replace(/\s+/gu, ""));
  if (chars.length < 8) return false;

  for (
    let size = 1;
    size <= Math.min(8, Math.floor(chars.length / 4));
    size += 1
  ) {
    for (let i = 0; i + size * 4 <= chars.length; i += 1) {
      let repeatCnt = 1;

      while (i + size * (repeatCnt + 1) <= chars.length) {
        let isDup = true;

        for (let j = 0; j < size; j += 1) {
          if (chars[i + j] !== chars[i + size * repeatCnt + j]) {
            isDup = false;
            break;
          }
        }
        if (!isDup) break;
        repeatCnt += 1;
      }
      if (repeatCnt >= 4 && repeatCnt * size >= 8) return true;
    }
  }
  return false;
}

export function isTransValid(src, trans) {
  const isTransValidRes = String(trans ?? "").trim();
  if (!isTransValidRes) return { ok: false, reason: "empty output" };

  const resLen = Array.from(isTransValidRes).length;
  const maxChars = Math.max(
    80,
    Array.from(String(src ?? "").trim()).length * 4 + 24,
  );
  if (resLen > maxChars) {
    return {
      ok: false,
      reason: `output (${resLen} > ${maxChars})`,
    };
  }

  if (isWordsRepeat(isTransValidRes) || isCharsRepeat(isTransValidRes)) {
    return { ok: false, reason: "repetition" };
  }
  return { ok: true };
}

export function maxTokens(src, cap = 384) {
  return Math.min(
    Number.isFinite(cap) ? Math.max(16, cap) : 384,
    Math.max(16, Math.ceil(Array.from(String(src ?? "")).length * 2.5 + 8)),
  );
}

export function getPipelineTxt(res) {
  const init = Array.isArray(res) ? res[0] : res;
  if (init && typeof init.translation_text === "string") {
    return init.translation_text;
  } else if (init && typeof init.generated_text === "string") {
    return init.generated_text;
  }
  return undefined;
}

function splitEmoji(str) {
  const txt = String(str ?? "");
  const seg = [];
  let offset = 0;

  for (const match of txt.matchAll(emojiRegex())) {
    const idx = match.index ?? offset;
    if (idx > offset) {
      seg.push({ type: "text", value: txt.slice(offset, idx) });
    }
    seg.push({ type: "emoji", value: match[0] });
    offset = idx + match[0].length;
  }

  if (offset < txt.length) {
    seg.push({ type: "text", value: txt.slice(offset) });
  }
  return seg.length ? seg : [{ type: "text", value: txt }];
}

export function splitEmojiMap(str) {
  return splitEmoji(str).map((seg) => ({
    protected: seg.type === "emoji",
    value: seg.value,
  }));
}

export function isModelTxt(value) {
  return PATTERN_MODEL_TXT.test(String(value ?? ""));
}

class TransHF {
  constructor(localeSrc) {
    this.localeSrc = localeNorm(localeSrc);
    this.langSrc = langModel(localeSrc);
    this.pipelinePromise = undefined;
    this.transMem = new Map();
  }

  async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        let transformers;
        try {
          transformers = await import("@huggingface/transformers");
        } catch (error) {
          throw new Error(
            "@huggingface/transformers is not installed. Run: npm install.",
            { cause: error },
          );
        }

        if (MODEL_ID === HF_MODEL && MODEL_DTYPE === "q8") {
          transformers.env.localModelPath = await assertModel({
            modelId: MODEL_ID,
          });
          transformers.env.allowLocalModels = true;
          transformers.env.allowRemoteModels = false;
          console.log(
            `Loading ${MODEL_ID} locally (${MODEL_DTYPE}, ${MODEL_TASK})...`,
          );
        } else {
          transformers.env.cacheDir = MODEL_CACHE_DIR;
          transformers.env.allowLocalModels = true;
          transformers.env.allowRemoteModels = true;
          console.log(`Loading ${MODEL_ID} (${MODEL_DTYPE}, ${MODEL_TASK})...`);
        }

        return transformers.pipeline(MODEL_TASK, MODEL_ID, {
          dtype: MODEL_DTYPE,
        });
      })();
    }
    return this.pipelinePromise;
  }

  optsGen(src, locale, retry = false) {
    const opts = {
      do_sample: false,
      max_new_tokens: maxTokens(
        src,
        retry
          ? Math.max(16, Math.ceil(Array.from(src).length * 1.75 + 8))
          : MAX_NEW_TOKENS,
      ),
      no_repeat_ngram_size: retry ? 2 : 3,
      repetition_penalty: retry ? 1.35 : 1.15,
    };
    if (MODEL_TASK === "translation") {
      opts.src_lang = this.langSrc;
      opts.tgt_lang = langModel(locale);
    }
    return opts;
  }

  async unitTrans(pipeline, src, locale) {
    if (src === undefined) return src;

    let isValidReason = "invalid response";
    for (const retry of [false, true]) {
      const res = await pipeline(src, this.optsGen(src, locale, retry));
      const trans = getPipelineTxt(res);
      if (trans === undefined) {
        isValidReason = "invalid response";
        continue;
      }
      const isValid = isTransValid(src, trans);
      if (isValid.ok) return trans;
      isValidReason = isValid.reason;
    }

    console.warn(
      `Rejected ${this.localeSrc} -> ${localeNorm(locale)} translation (${isValidReason}): ${src.replace(/\s+/gu, " ").slice(0, 80)}`,
    );
    return src;
  }

  async transMany(data, locale) {
    const lang = langModel(locale);
    if (lang === this.langSrc) {
      return new Map(data.map((str) => [str, str]));
    }

    const dataUniq = [...new Set(data.filter(Boolean))];
    const output = new Map();
    const srcPlans = [];
    const units = [];

    for (const str of dataUniq) {
      const memKey = `${MODEL_ID}:${MODEL_DTYPE}:${this.langSrc}:${lang}:${str}`;
      const mem = this.transMem.get(memKey);
      if (mem !== undefined) {
        output.set(str, mem);
        continue;
      }

      const parts = [];
      for (const part of splitEmojiMap(str)) {
        if (part.protected || !isModelTxt(part.value)) {
          parts.push({ literal: part.value });
          continue;
        }

        const ws = /^(\s*)([\s\S]*?)(\s*)$/u.exec(part.value);
        const leading = ws?.[1] ?? "";
        const core = ws?.[2] ?? part.value;
        const trailing = ws?.[3] ?? "";
        if (leading) parts.push({ literal: leading });
        for (const chunk of splitTxt(core)) {
          if (!isModelTxt(chunk)) {
            parts.push({ literal: chunk });
            continue;
          }
          const unit = units.length;
          units.push(chunk);
          parts.push({ unit });
        }
        if (trailing) parts.push({ literal: trailing });
      }
      srcPlans.push({ str, memKey, parts });
    }

    const unitsTrans = [];
    if (units.length) {
      const pl = await this.getPipeline();
      for (const unit of units) {
        unitsTrans.push(await this.unitTrans(pl, unit, locale));
      }
    }

    for (const plan of srcPlans) {
      const trans = plan.parts
        .map((part) =>
          "literal" in part ? part.literal : unitsTrans[part.unit],
        )
        .join("");
      this.transMem.set(plan.memKey, trans);
      output.set(plan.str, trans);
    }
    return output;
  }

  async transHtml(html, locale) {
    return transHTML(html, async (encHTML) => {
      const decodedMap = new Map(encHTML.map((str) => [str, decodeHTML(str)]));
      const trans = await this.transMany(
        [...new Set(decodedMap.values())],
        locale,
      );
      return new Map(
        encHTML.map((orig) => {
          const decoded = decodedMap.get(orig) ?? orig;
          return [orig, escHTML(trans.get(decoded) ?? decoded)];
        }),
      );
    });
  }

  async dispose() {
    if (!this.pipelinePromise) return;
    const pipeline = await this.pipelinePromise.catch(() => undefined);
    if (typeof pipeline?.dispose === "function") await pipeline.dispose();
  }
}

function localeNorm(locale) {
  return String(locale ?? "")
    .trim()
    .replaceAll("_", "-");
}

function localesUniq(localeSrc, locales) {
  return [
    ...new Set(
      [localeSrc, ...(Array.isArray(locales) ? locales : [])]
        .map(localeNorm)
        .filter(Boolean),
    ),
  ];
}

function isLocale(locale) {
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(locale)) {
    throw new Error(`Invalid locale: ${locale}`);
  }
}

function escHTML(html) {
  return html.replace(/[&<>"']/g, (char) => HTML_ESC[char] ?? char);
}

function genPath(locale) {
  return resolve(GEN_DIR, `${locale}.json`);
}

function isCurTrans(existing, { locale, localeSrc, srcHash }) {
  return (
    existing?.locale === locale &&
    existing?.localeSrc === localeSrc &&
    existing?.srcHash === srcHash &&
    existing?.generator?.provider === MODEL_META.provider &&
    existing?.generator?.model === MODEL_META.model &&
    existing?.generator?.dtype === MODEL_META.dtype &&
    existing?.generator?.task === MODEL_META.task &&
    existing?.generator?.emoji === MODEL_META.emoji &&
    existing?.generator?.localeMap === MODEL_META.localeMap
  );
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function writeJson(path, data) {
  return writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function pubLocalePath(locale) {
  return resolve(PUB_DIR, `${locale}.json`);
}

function trans(conf, gen) {
  if (
    !gen ||
    typeof gen !== "object" ||
    typeof gen.locale !== "string" ||
    typeof gen.tagline !== "string" ||
    !gen.readme ||
    typeof gen.readme.html !== "string"
  ) {
    throw new Error(
      `Generated translation for ${String(gen?.locale ?? "unknown")} is invalid.`,
    );
  }

  return {
    locale: gen.locale,
    title: `${String(conf.tabName || conf.githubName || "").trim()} — ${String(gen?.tabSuffix || TAB_SUFFIX)}`,
    tagline: gen.tagline,
    readmeHTML: gen.readme.html,
  };
}

async function pubTrans(locales, conf) {
  await rm(PUB_DIR, { recursive: true, force: true });
  if (locales.length <= 1) return;

  await mkdir(PUB_DIR, { recursive: true });
  await Promise.all(
    locales.map(async (locale) => {
      const gen = await readJson(genPath(locale));
      if (!gen) {
        throw new Error(
          `Missing generated translation for ${locale}. Run: npm run i18n.`,
        );
      }
      await writeJson(pubLocalePath(locale), trans(conf, gen));
    }),
  );
}

async function main() {
  const conf = await readJson(resolve(process.cwd(), "site.config.json"));
  if (!conf || typeof conf !== "object") {
    throw new Error("site.config.json could not be read.");
  }

  const localeSrc = localeNorm(conf.language) || "en";
  const locales = localesUniq(localeSrc, conf.locales);
  for (const locale of locales) isLocale(locale);

  const username = String(conf.githubName ?? "").trim();
  const repoName = String(conf.repoName ?? "").trim();
  const tagline = String(conf.tagline ?? "");
  const tabSuffix = String(conf.tabSuffix ?? "").trim() || TAB_SUFFIX;
  let readme = await fetchReadMe(username, repoName);
  if (!readme.isSuccess) {
    const prevSrc = await readJson(genPath(localeSrc));
    if (
      prevSrc?.readme?.isSuccess === true &&
      prevSrc.readme.owner === readme.owner &&
      prevSrc.readme.repoName === readme.repoName &&
      prevSrc.readme.readmeDir === readme.readmeDir
    ) {
      console.warn("Reverting to prior README from the same repo.");
      readme = prevSrc.readme;
    }
  }

  const srcHash = createHash("sha256")
    .update(JSON.stringify({ localeSrc, tabSuffix, tagline, readme }))
    .digest("hex");

  const sharedDoc = { localeSrc, srcHash };
  await mkdir(GEN_DIR, { recursive: true });
  await writeJson(genPath(localeSrc), {
    ...sharedDoc,
    locale: localeSrc,
    generator: { provider: "source" },
    tabSuffix,
    tagline,
    readme,
  });

  const targetLocales = locales.filter((locale) => locale !== localeSrc);
  if (targetLocales.length) {
    langModel(localeSrc);
    for (const locale of targetLocales) langModel(locale);
  }

  const currentTranslations = await Promise.all(
    targetLocales.map(async (locale) =>
      isCurTrans(await readJson(genPath(locale)), {
        locale,
        localeSrc,
        srcHash,
      }),
    ),
  );
  const localesStale = targetLocales.filter(
    (_locale, index) => !currentTranslations[index],
  );
  if (!localesStale.length) {
    await pubTrans(locales, conf);
    console.log("Translations are up to date.");
    return;
  }

  console.log(`Generating: ${localesStale.join(", ")}`);
  const transHF = new TransHF(localeSrc);
  try {
    for (const locale of localesStale) {
      console.log(`Translating ${localeSrc} -> ${locale}...`);
      const txt = await transHF.transMany(
        [tabSuffix, tagline].filter(Boolean),
        locale,
      );
      const transTabSuffix = txt.get(tabSuffix) ?? tabSuffix;
      const transTagline = tagline ? (txt.get(tagline) ?? tagline) : "";
      const transReadme = await transHF.transHtml(readme.html, locale);

      await writeJson(genPath(locale), {
        ...sharedDoc,
        locale,
        generator: MODEL_META,
        tabSuffix: transTabSuffix,
        tagline: transTagline,
        readme: {
          ...readme,
          html: transReadme,
        },
      });
    }
  } finally {
    await transHF.dispose();
  }

  await pubTrans(locales, conf);
  console.log("Profile translations complete.");
}

main().catch((error) => {
  console.error("Failed to translate profile.");
  console.error(error);
  process.exitCode = 1;
});
