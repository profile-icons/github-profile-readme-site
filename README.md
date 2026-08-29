# GitHub Profile README Site

Deploy your GitHub user or organization profile `README.md` as a static Astro site using Actions with:

- profile avatar
- (optional) tagline
- (optional) themes and styles
- (optional) i18n translations
- (optional) website icon links
- (optional) organization badge links
- and full support of GitHub README Markdown format

An example site can be found here: [https://profile-icons.github.io/github-profile-readme-site/](https://profile-icons.github.io/github-profile-readme-site/)

## Instructions

### Setup

<details>
<summary>Option 1: Repository Template</summary>

##### Repository Template

Create a [template](https://github.com/new?template_name=github-profile-readme-site&template_owner=r055a) copy (recommended) of this repository, or a [fork](https://github.com/r055a/github-profile-readme-site/fork) (for contributing).

#### User profile

If you don't have a GitHub profile `README.md`, name the repo copy the same as your username for creating one.

An example can be found here for a user profile: [r055a/r055a](https://github.com/r055a/r055a).

#### Organization profile

If the profile is for an organization, name it `.github` and create a `profile/README.md` to make it.

An example can be found here for an organization profile: [uni-git-projects/.github](https://github.com/uni-git-projects/.github).
</details>

<details>
<summary>Option 2: Action Workflow</summary>

##### Action Workflow

Create and add the following workflow to: `.github/workflows/deploy-profile-site.yml`

```yaml
name: deploy-profile-site

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: gh-pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Build
        id: profile-site
        uses: profile-icons/github-profile-readme-site@v1
        with:
          hf-token: ${{ secrets.HF_TOKEN }}

      - name: Upload
        uses: actions/upload-pages-artifact@v5
        with:
          path: ${{ steps.profile-site.outputs.dist-path }}

  deploy:
    needs: build
    runs-on: ubuntu-latest

    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v5
```
</details>

### Configure

To display your profile README content in the site, create/edit `site.config.json`:

- **[required]** GitHub _user_ or _organization_ name: `githubName`
- **[required]** GitHub profile site _URL_: `siteUrl`
- [_optional_] GitHub repo the README data is fetched from (defaults to _profile_ repo): `repoName`
- [_optional_] GitHub repo the profile site is deployed from (defaults to `repoName`): `basePath`
- [_optional_] A brief tagline to complement the profile Avatar (associated with `githubName`): `tagline`
- [_optional_] The tab (user/org) identifier for the profile site (defaults to `githubName`): `tabName`
- [_optional_] The tab title for the profile site (defaults to _"GitHub profile"_): `tabSuffix`
- [_optional_] The site description (not displayed on the deployed site): `description`
- [_optional_] A theme name for the site theme (`github-soft`, for example) - refer below for more info: `theme`
- [_optional_] A (RGB, HEX) color for accent, supporting colors (and `theme` when it is an empty string): `themeColor`
- [_optional_] A style name for the site style (`aurora`, for example) - refer below for more info: `style`
- [_optional_] A list of GitHub organization links to display as badges - refer below for more info: `organizations` 
- [_optional_] The language the profile README Markdown is written in (defaults to _"en"_): `language`
- [_optional_] A list of locales for providing translations from `language` - refer below for more info: `locales`
- [_optional_] A dictionary of website-link mapping for providing icon links - refer below for more info: `links`

```json
{
  "githubName": "",
  "siteUrl": "",
  "repoName": "",
  "basePath": "",
  "tagline": "",
  "tabName": "",
  "tabSuffix": "",
  "description": "",
  "theme": "",
  "themeColor": "",
  "style": "",
  "organizations": [],
  "language": "",
  "locales": [],
  "links": {}
}
```

### Theme

Select from any one of the available themes:

* `github-colorblind`
* `github-default`
* `github-dimmed`
* `github-high-contrast`
* `github-soft`
* `github-tritanopia`

Each theme supports light and dark mode. CSS can be found in `src/themes.json`.

### Style

Select from any one of the available styles:

* `aurora`
* `gradient`
* `grid`
* `glow`
* `solid`

CSS can be found in `src/styles.json`.

### Organization Badges

Each entry in the **organizations** array is a GitHub organization name, ie: `["org-name-one", "org-name-two", ...]`

### Locales - i18n

Profile translations are generated for **locales** prior to deployment using the [Xenova/nllb-200-distilled-600M](https://huggingface.co/Xenova/nllb-200-distilled-600M) model.

Each entry in the **locales** array is a code corresponding to a language being translated, ie: `["sv", "de", ...]`

<details>
<summary>Valid locale code values for translation are listed here (mapped to respective language-key for reference)
</summary>

```json
{
  "Acehnese (Latin script)": "ace",
  "Acehnese (Arabic script)": "ace-Arab",
  "Afrikaans": "af",
  "Akan": "ak",
  "Albanian": "sq",
  "Amharic": "am",
  "Arabic": "ar",
  "Arabic (Mesopotamian)": "acm",
  "Arabic (Ta'izzi-Adeni)": "acq",
  "Arabic (Tunisian)": "aeb",
  "Arabic (South Levantine)": "ajp",
  "Arabic (North Levantine)": "apc",
  "Arabic (Najdi)": "ars",
  "Arabic (Moroccan)": "ary",
  "Arabic (Egyptian)": "arz",
  "Armenian": "hy",
  "Assamese": "as",
  "Asturian": "ast",
  "Awadhi": "awa",
  "Aymara": "ayr",
  "Azerbaijani": "az",
  "Azerbaijani (Azerbaijan)": "az-AZ",
  "Azerbaijani (Iran)": "az-IR",
  "Azerbaijani (South)": "azb",
  
  "Balinese": "ban",
  "Bambara": "bm",
  "Banjar (Latin script)": "bjn",
  "Banjar (Arabic script)": "bjn-Arab",
  "Bashkir": "ba",
  "Basque": "eu",
  "Belarusian": "be",
  "Bemba": "bem",
  "Bengali": "bn",
  "Bhojpuri": "bho",
  "Bosnian": "bs",
  "Buginese": "bug",
  "Bulgarian": "bg",
  "Burmese": "my",
  
  "Catalan": "ca",
  "Cebuano": "ceb",
  "Central Atlas Tamazight": "tzm",
  "Central Kanuri (Latin script)": "knc",
  "Central Kanuri (Arabic script)": "knc-Arab",
  "Chhattisgarhi": "hne",
  "Chinese": "zh",
  "Chinese (Simplified)": "zh-Hans",
  "Chinese (Traditional)": "zh-Hant",
  "Chinese (China)": "zh-CN",
  "Chinese (Hong Kong)": "zh-HK",
  "Chinese (Macao)": "zh-MO",
  "Chinese (Singapore)": "zh-SG",
  "Chinese (Taiwan)": "zh-TW",
  "Chokwe": "cjk",
  "Crimean Tatar": "crh",
  "Czech": "cs",
  
  "Danish": "da",
  "Dari": "prs",
  "Dari (Afghanistan)": "fa-AF",
  "Dutch": "nl",
  "Dyula": "dyu",
  "Dzongkha": "dz",
  
  "English": "en",
  "Esperanto": "eo",
  "Estonian": "et",
  "Ewe": "ee",
  
  "Faroese": "fo",
  "Fijian": "fj",
  "Filipino": "fil",
  "Finnish": "fi",
  "Fon": "fon",
  "French": "fr",
  "Friulian": "fur",
  "Fulah": "ff",
  
  "Galician": "gl",
  "Ganda": "lg",
  "Georgian": "ka",
  "German": "de",
  "Greek": "el",
  "Guarani": "gn",
  "Gujarati": "gu",
  
  "Haitian Creole": "ht",
  "Hausa": "ha",
  "Hebrew": "he",
  "Hindi": "hi",
  "Croatian": "hr",
  "Hungarian": "hu",
  
  "Icelandic": "is",
  "Igbo": "ig",
  "Iloko": "ilo",
  "Indonesian": "id",
  "Irish": "ga",
  "Italian": "it",
  
  "Japanese": "ja",
  "Javanese": "jv",
  "Jingpho": "kac",
  
  "Kabiyè": "kbp",
  "Kabyle": "kab",
  "Kabuverdianu": "kea",
  "Kamba": "kam",
  "Kannada": "kn",
  "Kashmiri (Arabic script)": "ks",
  "Kashmiri (Devanagari script)": "ks-Deva",
  "Kazakh": "kk",
  "Khmer": "km",
  "Kikuyu": "ki",
  "Kimbundu": "kmb",
  "Kongo": "kg",
  "Korean": "ko",
  "Kurdish": "ku",
  "Kurdish (Arabic script)": "ku-Arab",
  "Kurdish (Central)": "ckb",
  "Kurdish (Latin script)": "ku-Latn",
  "Kurdish (Northern)": "kmr",
  "Kyrgyz": "ky",
  
  "Lao": "lo",
  "Latgalian": "ltg",
  "Latvian": "lv",
  "Ligurian": "lij",
  "Limburgish": "li",
  "Lingala": "ln",
  "Lithuanian": "lt",
  "Lombard": "lmo",
  "Luba-Kasai": "lua",
  "Luo": "luo",
  "Luxembourgish": "lb",
  
  "Macedonian": "mk",
  "Magahi": "mag",
  "Maithili": "mai",
  "Malagasy": "mg",
  "Malay": "ms",
  "Malayalam": "ml",
  "Maltese": "mt",
  "Maori": "mi",
  "Marathi": "mr",
  "Meitei (Bengali script)": "mni",
  "Minangkabau (Latin script)": "min",
  "Mizo": "lus",
  "Mongolian": "mn",
  "Mossi": "mos",
  
  "Nepali": "ne",
  "Northern Sotho": "ns",
  "Northern Sotho (nso)": "nso",
  "Norwegian": "no",
  "Norwegian Bokmål": "nb",
  "Norwegian Nynorsk": "nn",
  "Nuer": "nus",
  "Nyanja": "ny",
  
  "Occitan": "oc",
  "Odia": "or",
  "Oromo": "om",
  
  "Pangasinan": "pag",
  "Papiamento": "pap",
  "Pashto": "ps",
  "Persian": "fa",
  "Persian (Iran)": "fa-IR",
  "Polish": "pl",
  "Portuguese": "pt",
  "Punjabi": "pa",
  
  "Quechua": "qu",
  
  "Romanian": "ro",
  "Rundi": "rn",
  "Russian": "ru",
  "Kinyarwanda": "rw",
  
  "Samoan": "sm",
  "Sango": "sg",
  "Sanskrit": "sa",
  "Santali": "sat",
  "Sardinian": "sc",
  "Scottish Gaelic": "gd",
  "Serbian": "sr",
  "Shan": "shn",
  "Shona": "sn",
  "Sicilian": "scn",
  "Silesian": "szl",
  "Sindhi": "sd",
  "Sinhala": "si",
  "Slovak": "sk",
  "Slovenian": "sl",
  "Somali": "so",
  "Southern Sotho": "st",
  "Spanish": "es",
  "Sundanese": "su",
  "Swahili": "sw",
  "Swati": "ss",
  "Swedish": "sv",
  
  "Tagalog": "tl",
  "Tajik": "tg",
  "Tamasheq (Latin script)": "taq",
  "Tamasheq (Tifinagh script)": "taq-Tfng",
  "Tamil": "ta",
  "Tatar": "tt",
  "Telugu": "te",
  "Thai": "th",
  "Tibetan": "bo",
  "Tigrinya": "ti",
  "Tok Pisin": "tpi",
  "Tsonga": "ts",
  "Tswana": "tn",
  "Tumbuka": "tum",
  "Turkish": "tr",
  "Turkmen": "tk",
  "Twi": "tw",
  
  "Ukrainian": "uk",
  "Umbundu": "umb",
  "Urdu": "ur",
  "Uyghur": "ug",
  "Uzbek": "uz",
  
  "Venetian": "vec",
  "Vietnamese": "vi",
  
  "Waray": "war",
  "Welsh": "cy",
  "Wolof": "wo",
  
  "Xhosa": "xh",
  
  "Yiddish": "yi",
  "Yoruba": "yo",
  "Cantonese": "yue",
  
  "Zulu": "zu"
}
```

</details>

> Note: if changing browser languages during a session, a cache refresh may be required to render translations.

###### HF_TOKEN

Optionally, add a HuggingFace token as a repository secret named `HF_TOKEN` for authenticated model downloading.

### Icon Links

Each entry in the **links** `{key: value}` object maps a platform/icon ID (`key`) to its destination URL (`value`).

### Example

```json
{
  "githubName": "r055a",
  "siteUrl": "https://r055a.github.io",
  "repoName": "",
  "basePath": "",
  "tagline": "Just a guy who likes ☕",
  "tabName": "Adam Ross",
  "tabSuffix": "GitHub Profile",
  "description": "A static profile site for rendering GitHub README markdown content with avatar, tagline & icon links",
  "theme": "github-soft",
  "themeColor": "",
  "style": "aurora",
  "organizations": [
    "uni-git-projects",
    "uni-projects-demos",
    "profile-icons",
    "hacktoberfest-stats"
  ],
  "language": "en",
  "locales": ["sv", "de", "es", "fr", "hi", "zh"],
  "links": {
    "buymeacoffee": "https://example.com",
    "dev.to": "https://example.com",
    "email": "example@email.com",
    "github": "https://example.com",
    "gitlab": "https://example.com",
    "googleScholar": "https://example.com",
    "huggingface": "https://example.com",
    "kaggle": "https://example.com",
    "ko-fi": "https://example.com",
    "linkedin": "https://example.com",
    "mastodon": "https://example.com",
    "medium": "https://example.com",
    "orcid": "https://example.com",
    "researchgate": "https://example.com",
    "stackoverflow": "https://example.com",
    "website": "https://example.com",
    "x": "https://example.com",
    "youtube": "https://example.com"
  }
}
```

## Local Development

### Install

```Bash
npm install
```

### i18n

```Bash
npm run i18n
```

### Development

```Bash
npm run dev
```

### Build

```Bash
npm run build
```

```Bash
npm run preview
```

## Contribute

Before making a Pull Request, ensure it addresses an Issue, and verify the branch passes:

```Bash
npm run quality:fix
```
