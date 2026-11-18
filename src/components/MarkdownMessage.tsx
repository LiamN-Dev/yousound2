import React from 'react';

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[\s\S]+?\*\*|__[^_]+__|~~[\s\S]+?~~|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  const output: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) output.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = keyPrefix + '-' + index++;
    if (token.startsWith('$') && token.endsWith('$')) {
      output.push(<span key={key} className="rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-cyan-100">{prettyMath(token.slice(2, -2))}</span>);
    } else if (token.startsWith('
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      output.push(<s key={key}>{inline(token.slice(2, -2), key)}</s>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      output.push(<code key={key} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1).trim()}</code>);
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      output.push(<em key={key} className="italic">{inline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith('[')) {
      const parsed = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (parsed) {
        output.push(<a key={key} href={parsed[2]} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100">{parsed[1]}</a>);
      } else output.push(token);
    } else {
      output.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

function prettyMath(value: string): string {
  return value
    .replace(/\\left|\\right/g, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\sqrt/g, '√')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/_\{([^{}]+)\}/g, '_($1)')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .trim();
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function isTableDivider(line: string): boolean {
  const values = cells(line);
  return values.length > 0 && values.every(value => /^:?-{3,}:?$/.test(value));
}

export const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => {
  let normalized = String(content || '').replace(/\r/g, '');
  // Some model responses arrive as one long line even though they contain
  // Markdown separators, headings, lists, and display-math delimiters.
  if (!normalized.includes('\n')) {
    normalized = normalized
      .replace(/\s+(---+|\*\*\*+|___+)\s+/g, '\n\n$1\n\n')
      .replace(/\s+(#{1,6}\s+)/g, '\n\n$1')
      .replace(/\s+(\d+\.\s+)/g, '\n$1')
      .replace(/\s+(\*\s+(?=\*\*|If\b|Where\b|Using\b|The\b))/g, '\n$1')
      .replace(/\s*(\$\$[\s\S]*?\$\$)\s*/g, '\n\n$1\n\n');
  }
  const lines = normalized.split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.trim() === '$') {
      index += 1;
      const formula: string[] = [];
      while (index < lines.length && lines[index].trim() !== '$') formula.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<div key={'math-' + index} className="my-4 overflow-x-auto rounded-xl border border-cyan-200/10 bg-black/20 px-4 py-3 text-center font-mono text-sm leading-7 text-cyan-100">{prettyMath(formula.join(' '))}</div>);
      continue;
    }

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={'code-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-cyan-50">
          {language && <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">{language}</div>}
          <code className="font-mono">{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const size = heading[1].length;
      const className = size === 1 ? 'mt-4 text-lg font-black text-white' : size === 2 ? 'mt-4 text-base font-bold text-white' : 'mt-3 text-sm font-bold text-white';
      blocks.push(<div key={'heading-' + index} className={className}>{inline(heading[2], 'h' + index)}</div>);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      blocks.push(<hr key={'hr-' + index} className="my-3 border-white/10" />);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]));
      blocks.push(
        <div key={'table-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-white/[.07]"><tr>{headers.map((cell, i) => <th key={i} className="px-3 py-2 font-bold text-white">{inline(cell, 'th' + index + '-' + i)}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => <tr key={ri} className="border-t border-white/10">{headers.map((_, ci) => <td key={ci} className="px-3 py-2 align-top text-slate-200">{inline(row[ci] || '', 'td' + index + '-' + ri + '-' + ci)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={'quote-' + index} className="my-3 border-l-2 border-cyan-300/50 pl-3 text-slate-300">{quote.map((part, i) => <div key={i}>{inline(part, 'q' + index + '-' + i)}</div>)}</blockquote>);
      continue;
    }

    const listMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(lines[index]);
        if (!itemMatch || /^\s*\d+\./.test(lines[index]) !== ordered) break;
        items.push(itemMatch[2]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={'list-' + index} className={'my-2 space-y-1 pl-5 text-slate-200 ' + (ordered ? 'list-decimal' : 'list-disc')}>{items.map((item, i) => <li key={i} className="pl-1">{inline(item, 'li' + index + '-' + i)}</li>)}</List>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index].trim()) && !lines[index].trim().startsWith('```') && !/^\s*>/.test(lines[index]) && !/^\s*([-*+] |\d+\. )/.test(lines[index]) && !/^(---+|\*\*\*+|___+)$/.test(lines[index].trim())) {
      if (index + 1 < lines.length && lines[index].includes('|') && isTableDivider(lines[index + 1])) break;
      paragraph.push(lines[index++]);
    }
    if (paragraph.length) blocks.push(<p key={'p-' + index} className="my-2 whitespace-pre-wrap leading-6 text-slate-200">{inline(paragraph.join('\n'), 'p' + index)}</p>);
    else index += 1;
  }

  return <div className="min-w-0 break-words text-sm">{blocks}</div>;
};
) && token.endsWith('
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      output.push(<s key={key}>{inline(token.slice(2, -2), key)}</s>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      output.push(<code key={key} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1).trim()}</code>);
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      output.push(<em key={key} className="italic">{inline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith('[')) {
      const parsed = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (parsed) {
        output.push(<a key={key} href={parsed[2]} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100">{parsed[1]}</a>);
      } else output.push(token);
    } else {
      output.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function isTableDivider(line: string): boolean {
  const values = cells(line);
  return values.length > 0 && values.every(value => /^:?-{3,}:?$/.test(value));
}

export const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => {
  const lines = String(content || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={'code-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-cyan-50">
          {language && <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">{language}</div>}
          <code className="font-mono">{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const size = heading[1].length;
      const className = size === 1 ? 'mt-4 text-lg font-black text-white' : size === 2 ? 'mt-4 text-base font-bold text-white' : 'mt-3 text-sm font-bold text-white';
      blocks.push(<div key={'heading-' + index} className={className}>{inline(heading[2], 'h' + index)}</div>);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      blocks.push(<hr key={'hr-' + index} className="my-3 border-white/10" />);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]));
      blocks.push(
        <div key={'table-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-white/[.07]"><tr>{headers.map((cell, i) => <th key={i} className="px-3 py-2 font-bold text-white">{inline(cell, 'th' + index + '-' + i)}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => <tr key={ri} className="border-t border-white/10">{headers.map((_, ci) => <td key={ci} className="px-3 py-2 align-top text-slate-200">{inline(row[ci] || '', 'td' + index + '-' + ri + '-' + ci)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={'quote-' + index} className="my-3 border-l-2 border-cyan-300/50 pl-3 text-slate-300">{quote.map((part, i) => <div key={i}>{inline(part, 'q' + index + '-' + i)}</div>)}</blockquote>);
      continue;
    }

    const listMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(lines[index]);
        if (!itemMatch || /^\s*\d+\./.test(lines[index]) !== ordered) break;
        items.push(itemMatch[2]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={'list-' + index} className={'my-2 space-y-1 pl-5 text-slate-200 ' + (ordered ? 'list-decimal' : 'list-disc')}>{items.map((item, i) => <li key={i} className="pl-1">{inline(item, 'li' + index + '-' + i)}</li>)}</List>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index].trim()) && !lines[index].trim().startsWith('```') && !/^\s*>/.test(lines[index]) && !/^\s*([-*+] |\d+\. )/.test(lines[index]) && !/^(---+|\*\*\*+|___+)$/.test(lines[index].trim())) {
      if (index + 1 < lines.length && lines[index].includes('|') && isTableDivider(lines[index + 1])) break;
      paragraph.push(lines[index++]);
    }
    if (paragraph.length) blocks.push(<p key={'p-' + index} className="my-2 whitespace-pre-wrap leading-6 text-slate-200">{inline(paragraph.join('\n'), 'p' + index)}</p>);
    else index += 1;
  }

  return <div className="min-w-0 break-words text-sm">{blocks}</div>;
};
)) {
      output.push(<span key={key} className="rounded bg-black/15 px-1 font-mono text-cyan-100">{prettyMath(token.slice(1, -1))}</span>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('__') && token.endsWith('__')) {
      output.push(<strong key={key} className="font-bold text-white">{inline(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      output.push(<s key={key}>{inline(token.slice(2, -2), key)}</s>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      output.push(<code key={key} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1).trim()}</code>);
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      output.push(<em key={key} className="italic">{inline(token.slice(1, -1), key)}</em>);
    } else if (token.startsWith('[')) {
      const parsed = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (parsed) {
        output.push(<a key={key} href={parsed[2]} target="_blank" rel="noopener noreferrer" className="text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-cyan-100">{parsed[1]}</a>);
      } else output.push(token);
    } else {
      output.push(token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
}

function isTableDivider(line: string): boolean {
  const values = cells(line);
  return values.length > 0 && values.every(value => /^:?-{3,}:?$/.test(value));
}

export const MarkdownMessage: React.FC<{ content: string }> = ({ content }) => {
  const lines = String(content || '').replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith('```')) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={'code-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-cyan-50">
          {language && <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">{language}</div>}
          <code className="font-mono">{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const size = heading[1].length;
      const className = size === 1 ? 'mt-4 text-lg font-black text-white' : size === 2 ? 'mt-4 text-base font-bold text-white' : 'mt-3 text-sm font-bold text-white';
      blocks.push(<div key={'heading-' + index} className={className}>{inline(heading[2], 'h' + index)}</div>);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(line.trim())) {
      blocks.push(<hr key={'hr-' + index} className="my-3 border-white/10" />);
      index += 1;
      continue;
    }

    if (index + 1 < lines.length && line.includes('|') && isTableDivider(lines[index + 1])) {
      const headers = cells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]));
      blocks.push(
        <div key={'table-' + index} className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-white/[.07]"><tr>{headers.map((cell, i) => <th key={i} className="px-3 py-2 font-bold text-white">{inline(cell, 'th' + index + '-' + i)}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => <tr key={ri} className="border-t border-white/10">{headers.map((_, ci) => <td key={ci} className="px-3 py-2 align-top text-slate-200">{inline(row[ci] || '', 'td' + index + '-' + ri + '-' + ci)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={'quote-' + index} className="my-3 border-l-2 border-cyan-300/50 pl-3 text-slate-300">{quote.map((part, i) => <div key={i}>{inline(part, 'q' + index + '-' + i)}</div>)}</blockquote>);
      continue;
    }

    const listMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const itemMatch = /^\s*([-*+] |\d+\. )(.+)$/.exec(lines[index]);
        if (!itemMatch || /^\s*\d+\./.test(lines[index]) !== ordered) break;
        items.push(itemMatch[2]);
        index += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={'list-' + index} className={'my-2 space-y-1 pl-5 text-slate-200 ' + (ordered ? 'list-decimal' : 'list-disc')}>{items.map((item, i) => <li key={i} className="pl-1">{inline(item, 'li' + index + '-' + i)}</li>)}</List>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+/.test(lines[index].trim()) && !lines[index].trim().startsWith('```') && !/^\s*>/.test(lines[index]) && !/^\s*([-*+] |\d+\. )/.test(lines[index]) && !/^(---+|\*\*\*+|___+)$/.test(lines[index].trim())) {
      if (index + 1 < lines.length && lines[index].includes('|') && isTableDivider(lines[index + 1])) break;
      paragraph.push(lines[index++]);
    }
    if (paragraph.length) blocks.push(<p key={'p-' + index} className="my-2 whitespace-pre-wrap leading-6 text-slate-200">{inline(paragraph.join('\n'), 'p' + index)}</p>);
    else index += 1;
  }

  return <div className="min-w-0 break-words text-sm">{blocks}</div>;
};
