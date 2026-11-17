# Citation Preview assets

## Screenshots

[citation-preview-live.png](citation-preview-live.png) is an unmodified screenshot of the published Citation Preview 0.2.0 XPI running in isolated Linux Zotero 10.0.8. It comes from the `issue-1-live/screenshot.png` artifact in the [published-installer verification](https://github.com/yulong-ge/zotero-citation-preview/actions/runs/44022922279). The capture uses native pointer interaction and live Crossref/arXiv requests.

The displayed PDF is the public [Kalman-Edit conference paper](https://papers.nips.cc/paper_files/paper/2025/file/d01db5cd2555ba11f75da0454d57b903-Paper-Conference.pdf). Reference 44 resolves to [Deep Unsupervised Learning using Nonequilibrium Thermodynamics](https://arxiv.org/abs/1503.03585). The paper content belongs to its respective authors. This image illustrates the Linux reader; it does not establish macOS or Windows visual parity.

Screenshots are documentation assets and are excluded from the XPI. Replace the image and update this provenance when the documented interface changes.

## Icon

[citation-preview.png](citation-preview.png) is the source image generated with OpenAI's built-in image generation tool for Issue #6. It represents a paper and a citation popover. The PNG retains transparency; it is project artwork, not the Zotero logo.

The files in [icons](../icons/) are 32, 64 and 128 pixel resizes of this source. Only those sizes ship in the XPI. The build validates the manifest paths and image dimensions; the native host test verifies that Zotero registers and decodes the icon.

Generation prompt:

> Use case: logo-brand. Create a finished square application icon for Citation Preview, a Zotero extension that reveals a cited paper's title and abstract when hovering a reference. A single bold, minimalist symbol combining a scholarly document page with a small popover card, using a recognizable quotation-mark or citation-bracket motif. Professional and calm, very clean flat graphic geometry with gently rounded corners, strong contrast, readable at 32 px. One coherent mark only, centered with generous transparent padding. A restrained deep burgundy and warm ivory palette suited to an academic reading app. True transparent background, no background scene, no mockup, no shadows outside the mark, no letters, words, numbers, watermark, or multiple logo options. Output a square raster PNG; this is the actual plugin icon asset.
