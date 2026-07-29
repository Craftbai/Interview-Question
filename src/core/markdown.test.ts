import { describe, expect, it } from 'vitest';
import { esc, renderMD } from './markdown';

describe('markdown', () => {
  it('escapes html before anything else', () => {
    expect(esc('<script>alert(1)</script>')).not.toContain('<script>');
    expect(renderMD('<img onerror=x>')).not.toContain('<img onerror');
  });

  it('renders fenced code blocks', () => {
    const out = renderMD('```c\nint x = 1;\n```');
    expect(out).toContain('<pre');
    expect(out).toContain('int x = 1;');
  });

  it('renders inline code', () => {
    expect(renderMD('用 `volatile` 修饰')).toContain('<code>volatile</code>');
  });

  it('renders tables', () => {
    const out = renderMD('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(out).toContain('<table');
    expect(out).toContain('<td');
  });

  it('renders blockquotes', () => {
    expect(renderMD('> 注意这里')).toContain('<blockquote');
  });

  it('renders bold and preserves chinese punctuation', () => {
    const out = renderMD('**重点**：不要漏掉');
    expect(out).toContain('<strong>重点</strong>');
    expect(out).toContain('：');
  });

  it('keeps backslashes in code intact', () => {
    expect(renderMD('`C:\\\\path`')).toContain('C:\\\\path');
  });

  it('blocks javascript: and other dangerous url schemes in links', () => {
    // esc() 不转义这些字符，所以只有白名单能拦住
    expect(renderMD('[点这里](javascript:alert(1))')).not.toContain('javascript:');
    expect(renderMD('[x](JaVaScRiPt:alert(1))')).not.toContain('aVaScRiPt:');
    expect(renderMD('[x](data:text/html,<script>)')).not.toContain('data:text/html');
    expect(renderMD('[x](//evil.com)')).toContain('href="#"');
  });

  it('keeps legitimate urls intact', () => {
    expect(renderMD('[x](https://example.com/a?b=1)')).toContain('href="https://example.com/a?b=1"');
    expect(renderMD('[x](http://example.com)')).toContain('href="http://example.com"');
    expect(renderMD('[x](#anchor)')).toContain('href="#anchor"');
    expect(renderMD('[x](docs/a.md)')).toContain('href="docs/a.md"');
  });

  it('does not throw on empty or undefined-ish input', () => {
    expect(renderMD('')).toBe('');
    expect(() => renderMD('\n\n\n')).not.toThrow();
  });
});
