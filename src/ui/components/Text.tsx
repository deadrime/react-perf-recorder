/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';

/** One line of a report: a number, some prose, and the reason behind it. Shared by the live roots and the summary. */
export const Line = ({ children }: { children: ComponentChildren }) => <div class="line">{children}</div>;
export const N = ({ children }: { children: ComponentChildren }) => <span class="n">{children}</span>;
export const Why = ({ children }: { children: ComponentChildren }) => <span class="why">{children}</span>;
