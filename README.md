# Mathematical research notes

[Read the published studies](https://griboedow.github.io/).

The research lives in [Chua GPU Atlas](https://github.com/Griboedow/chua-gpu-atlas), [Chaos Attractor Lab](https://github.com/Griboedow/chaos-attractor-lab) and [Mathematical Models](https://github.com/Griboedow/math-models). **Edit or add a report in its original project.** The publisher reads each project's `main` branch, records its commit and builds the article, figures, catalog and sitemap from those sources. A reader can follow the source link at the end of an article to the exact revision.

GitHub Actions checks the three source revisions every three hours. A push to this site's `main` builds immediately. To publish between scheduled runs, use **Actions → Publish research notes → Run workflow**. GitHub may pause scheduled workflows in inactive public repositories. The same Actions page lets a maintainer re-enable the schedule.

## Coverage

The publisher discovers Markdown throughout each repository, including nested research notes, manuscripts, reproduction guides and results. Repository instructions, third-party notices and an explicitly vendored upstream reference stay in the original repositories. The catalog also includes the projects' HTML research reports and atlases. Code and data links retain their source revision. Original source licenses and third-party notices apply.

The homepage selection in `publisher/featured.mjs` and `publisher/layout.mjs` points to source paths. The build obtains article titles and figure files from those paths. Adding a new Markdown study to an existing project requires no change to this repository.

## Local preview

Use Node.js 24, Git, and Python 3.11 or later.

```sh
npm ci
python -m pip install Pillow==13.0.0
npm run build
node publisher/check.mjs
python -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. Set `PYTHON` to select a particular interpreter and `SOURCE_CACHE` to reuse a Git object cache. The deployed revision list is available in [publication.json](https://griboedow.github.io/publication.json).
