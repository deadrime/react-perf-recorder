import path from 'node:path';

export const cleanId = (id: string) => id.split('?')[0].replace(/\\/g, '/');

const globToRegExp = (glob: string) => {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&'))
        .join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
};

/**
 * Include/exclude globs relative to the project root. Virtual modules and node_modules never match: only the app's
 * own code gets transformed or proxied.
 */
export function createFilter(root: () => string, include: string[], exclude: string[] = []) {
  const inc = include.map(globToRegExp);
  const exc = exclude.map(globToRegExp);
  return (id: string | undefined): boolean => {
    if (!id || id.startsWith('\0') || id.includes('/node_modules/')) return false;
    const file = cleanId(id);
    const rel = path.isAbsolute(file) ? path.relative(root(), file).replace(/\\/g, '/') : file.replace(/^\//, '');
    if (rel.startsWith('..')) return false;
    return inc.some((re) => re.test(rel)) && !exc.some((re) => re.test(rel));
  };
}

export const relativeToRoot = (root: string, id: string) => path.relative(root, cleanId(id)).replace(/\\/g, '/');
