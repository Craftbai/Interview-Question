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

  it('does not throw on empty or undefined-ish input', () => {
    expect(renderMD('')).toBe('');
    expect(() => renderMD('\n\n\n')).not.toThrow();
  });
});
