import { Buffer } from "node:buffer";

function createFavUrl(imgUrl: string): string {
  const svg: string = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <clipPath id="avatar-circle">
          <circle cx="32" cy="32" r="31" />
        </clipPath>
      </defs>

      <image
        href="${imgUrl}"
        x="1"
        y="1"
        width="62"
        height="62"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#avatar-circle)"
      />
    </svg>
  `.trim();
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export async function fetchAvatar(
  avatarUrl: string,
): Promise<string | undefined> {
  try {
    const res: Response = await fetch(avatarUrl, {
      headers: {
        Accept: "image/*",
        "User-Agent": "github-profile-readme-site",
      },
    });
    if (!res.ok) {
      return undefined;
    }

    const contentType: string =
      res.headers.get("content-type")?.split(";", 1)[0]?.trim() || "image/png";
    if (!contentType.startsWith("image/")) {
      return undefined;
    }

    const encodedImg: string = Buffer.from(
      new Uint8Array(await res.arrayBuffer()),
    ).toString("base64");

    return createFavUrl(`data:${contentType};base64,${encodedImg}`);
  } catch {
    return undefined;
  }
}
