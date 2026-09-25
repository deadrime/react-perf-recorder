import { marked, type Tokens } from 'marked';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { href, useNoPanel } from './base';
import { BENCH_STYLES, BenchmarkCharts } from './Benchmarks';
import { DEMO_STYLES, REPO } from './Demo';

// The pages are the repository's own markdown, read at build time: the docs are written once, in docs/.
const files = import.meta.glob<string>(['../../../../docs/*.md', '../../../../README.md'], { query: '?raw', import: 'default', eager: true });

const ORDER = ['readme', 'panel', 'recording', 'measuring-a-fix', 'benchmarks', 'options', 'mcp', 'plugins', 'how-it-works', 'contributing'];

const pages = new Map(
  Object.entries(files).map(([file, text]) => {
    const slug = /README\.md$/.test(file) ? 'readme' : file.replace(/^.*\/([\w-]+)\.md$/, '$1');
    const title = slug === 'readme' ? 'Overview' : /^# (.+)$/m.exec(text)?.[1] ?? slug;
    return [slug, { slug, title, text }] as const;
  })
);
const ordered = ORDER.map((slug) => pages.get(slug)).filter((page) => page !== undefined);

/** A link between the markdown files becomes a page here; anything else in the repository opens on GitHub. */
function linkOf(target: string, from: string): string {
  if (/^[a-z]+:|^#/.test(target)) return target;
  const [path, hash = ''] = target.split('#');
  const md = /(?:^|\/)([\w-]+)\.md$/.exec(path)?.[1];
  if (md && pages.has(md)) return `${href(`docs/${md === 'readme' ? '' : md}`)}${hash ? `#${hash}` : ''}`;
  if (md?.toUpperCase() === 'README') return href('docs');
  const dir = from === 'readme' ? '' : 'docs/';
  return `${REPO}/blob/main/${new URL(path, `https://x/${dir}`).pathname.slice(1)}${hash ? `#${hash}` : ''}`;
}

function render(slug: string, text: string): string {
  return marked.parse(text, {
    async: false,
    walkTokens: (token) => {
      if (token.type === 'link') (token as Tokens.Link).href = linkOf((token as Tokens.Link).href, slug);
    },
  });
}

// Where a page's charts go: marked keeps the comment, GitHub shows nothing for it.
const CHARTS = '<!-- benchmark-charts -->';

const DOCS_STYLES = `
.docs { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 32px; max-width: 1100px; margin: 0 auto;
  padding: 24px 20px 64px; color: #e8e8ea; font: 15px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.docs nav { position: sticky; top: 16px; align-self: start; display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
.docs nav a { padding: 4px 10px; border-radius: 6px; color: #b9b9c2; text-decoration: none; }
.docs nav a:hover { color: #fff; background: rgba(255,255,255,.05); }
.docs nav a[aria-current="page"] { color: #fff; background: rgba(10,132,255,.16); }
.docs nav .home { margin-bottom: 10px; color: #0a84ff; }
.docs article { min-width: 0; }
.docs h1 { font-size: 26px; margin: 0 0 14px; color: #fff; }
.docs h2 { font-size: 19px; margin: 28px 0 10px; color: #fff; }
.docs h3 { font-size: 16px; margin: 22px 0 8px; color: #fff; }
.docs p, .docs li { color: #cfcfd6; }
.docs a { color: #0a84ff; }
.docs code { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #ffd60a; }
.docs pre { overflow-x: auto; padding: 12px 14px; border: 1px solid #3a3a44; border-radius: 8px; background: #1b1b21; }
.docs pre code { color: #e8e8ea; }
.docs table { display: block; overflow-x: auto; border-collapse: collapse; font-size: 14px; }
.docs th, .docs td { padding: 6px 10px; border: 1px solid #3a3a44; text-align: left; vertical-align: top; }
.docs th { color: #fff; background: #1b1b21; }
.docs table + table { margin-top: 16px; }
@media (max-width: 760px) {
  .docs { grid-template-columns: 1fr; gap: 12px; }
  .docs nav { position: static; flex-direction: row; flex-wrap: wrap; }
}
`;

export const DocsPage = () => {
  useNoPanel();
  const { page: slug = 'readme' } = useParams();
  const page = pages.get(slug) ?? pages.get('readme')!;
  const html = useMemo(() => render(page.slug, page.text), [page]);
  // Another page of the docs opens at its top, as a page load would. A block, not an expression: whatever scrollTo
  // returns — a browser or an extension may return something — would be taken for the effect's cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  return (
    <>
      <style>{DEMO_STYLES}</style>
      <style>{DOCS_STYLES}</style>
      <style>{BENCH_STYLES}</style>
      <div className="docs" data-testid="docs">
        <nav>
          <a className="home" href={href()}>
            ← Demo
          </a>
          {ordered.map((item) => (
            <Link
              key={item.slug}
              to={item.slug === 'readme' ? '/docs' : `/docs/${item.slug}`}
              aria-current={item.slug === page.slug ? 'page' : undefined}
            >
              {item.title}
            </Link>
          ))}
          <a href={REPO}>GitHub</a>
        </nav>
        {html.includes(CHARTS) ? (
          <article>
            <div dangerouslySetInnerHTML={{ __html: html.slice(0, html.indexOf(CHARTS)) }} />
            <BenchmarkCharts />
            <div dangerouslySetInnerHTML={{ __html: html.slice(html.indexOf(CHARTS) + CHARTS.length) }} />
          </article>
        ) : (
          <article dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </>
  );
};
