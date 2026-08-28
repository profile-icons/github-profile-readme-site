import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const HF_MODEL = "Xenova/nllb-200-distilled-600M";

const MODEL_FILES = Object.freeze([
  "config.json",
  "generation_config.json",
  "quantize_config.json",
  "sentencepiece.bpe.model",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
]);

const NUM_RETRIES = 8;
const TIMEOUT_MS = 30 * 60 * 1000;
const PROGRESS_STEP = 25 * 1024 * 1024;

function envInt(name, fallback, min = 1) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= min ? value : fallback;
}

function modelRoot() {
  return resolve(
    process.cwd(),
    process.env.HF_TRANS_LOCAL_DIR?.trim() || ".models",
  );
}

export function localModelDirectory(modelId = HF_MODEL) {
  return resolve(modelRoot(), ...String(modelId).split("/"));
}

function modelFilePath(modelId, file) {
  return resolve(localModelDirectory(modelId), ...String(file).split("/"));
}

function remoteUrl(modelId, revision, file) {
  const model = String(modelId).split("/").map(encodeURIComponent).join("/");
  const rev = encodeURIComponent(revision);
  const path = String(file).split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${model}/resolve/${rev}/${path}?download=true`;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function totalFromResponse(response, offset) {
  const contentRange = response.headers.get("content-range");
  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(contentRange ?? "");
  if (match) return Number.parseInt(match[1], 10);

  const length = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(length) && length >= 0) {
    return offset + length;
  }
  return undefined;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

async function downloadOne({ modelId, revision, file, token }) {
  const finalPath = modelFilePath(modelId, file);
  const partPath = `${finalPath}.part`;

  if ((await fileSize(finalPath)) > 0) {
    console.log(`Model file ready: ${file}`);
    return;
  }

  await mkdir(dirname(finalPath), { recursive: true });

  const retries = envInt("HF_TRANS_DOWNLOAD_RETRIES", NUM_RETRIES);
  const timeoutMs = envInt("HF_TRANS_DOWNLOAD_TIMEOUT_MS", TIMEOUT_MS, 1000);
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let offset = await fileSize(partPath);
    try {
      const headers = {
        "User-Agent": "github-profile-readme-site/1.0",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (offset > 0) headers.Range = `bytes=${offset}-`;

      console.log(
        `${offset > 0 ? "Resuming" : "Downloading"} ${file}${
          offset > 0 ? ` from ${formatMiB(offset)}` : ""
        } (attempt ${attempt}/${retries})...`,
      );

      const response = await fetch(remoteUrl(modelId, revision, file), {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 416 && offset > 0) {
        const range = response.headers.get("content-range") ?? "";
        const match = /bytes\s+\*\/(\d+)/i.exec(range);
        const total = match ? Number.parseInt(match[1], 10) : undefined;
        if (total !== undefined && offset === total) {
          await rename(partPath, finalPath);
          console.log(`Model file ready: ${file} (${formatMiB(total)})`);
          return;
        }
      }

      if (!response.ok && response.status !== 206) {
        throw new Error(
          `Hugging Face returned ${response.status} ${response.statusText} for ${file}.`,
        );
      }
      if (!response.body) {
        throw new Error(`Hugging Face returned an empty body for ${file}.`);
      }

      let flags = "a";
      if (offset > 0 && response.status !== 206) {
        await rm(partPath, { force: true });
        offset = 0;
        flags = "w";
      } else if (offset === 0) {
        flags = "w";
      }

      const expectedTotal = totalFromResponse(response, offset);
      let downloaded = offset;
      let nextProgress =
        Math.floor(downloaded / PROGRESS_STEP) * PROGRESS_STEP + PROGRESS_STEP;

      const progress = new Transform({
        transform(chunk, _encoding, callback) {
          downloaded += chunk.length;
          if (downloaded >= nextProgress) {
            const totalText = expectedTotal
              ? ` / ${formatMiB(expectedTotal)}`
              : "";
            console.log(`  ${file}: ${formatMiB(downloaded)}${totalText}`);
            nextProgress += PROGRESS_STEP;
          }
          callback(null, chunk);
        },
      });

      await streamPipeline(
        Readable.fromWeb(response.body),
        progress,
        createWriteStream(partPath, { flags }),
      );

      const size = await fileSize(partPath);
      if (expectedTotal !== undefined && size !== expectedTotal) {
        throw new Error(
          `Incomplete download for ${file}: ${size} bytes of ${expectedTotal} bytes.`,
        );
      }

      await rename(partPath, finalPath);
      console.log(`Model file ready: ${file} (${formatMiB(size)})`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const backoff = Math.min(30_000, 1500 * 2 ** (attempt - 1));
      console.warn(
        `Model download interrupted for ${file}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.warn(
        `Retrying in ${(backoff / 1000).toFixed(1)}s; partial data will be resumed.`,
      );
      await delay(backoff);
    }
  }

  throw new Error(
    `Failed to download ${file} after ${retries} attempts. Re-run the command to resume from the saved .part file.`,
    { cause: lastError },
  );
}

export async function assertModel({
  modelId = HF_MODEL,
  revision = process.env.HF_TRANS_REVISION?.trim() || "main",
  token = process.env.HF_TOKEN?.trim() || "",
} = {}) {
  if (modelId !== HF_MODEL) {
    throw new Error(
      `The resumable local downloader is configured for ${HF_MODEL}, not ${modelId}.`,
    );
  }

  await mkdir(localModelDirectory(modelId), { recursive: true });
  for (const file of MODEL_FILES) {
    await downloadOne({ modelId, revision, file, token });
  }
  return modelRoot();
}

async function main() {
  const modelId = process.env.HF_TRANS_MODEL?.trim() || HF_MODEL;
  const root = await assertModel({ modelId });
  console.log(`Local model ready under ${root}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error("Failed to prepare translation model.");
    console.error(error);
    process.exitCode = 1;
  });
}
