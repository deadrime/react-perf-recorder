/** The scene's size in its own pixels: the board as captured, cut to the window, and the caption strip under it. */
export const WIDE = { width: 760, stage: 760, caption: 110 };
/** A phone's window: a narrower cut the camera moves over, and a taller strip for the larger caption text. */
export const NARROW = { width: 480, stage: 600, caption: 150 };
/** Where the landing switches the window to NARROW; the scene's own stylesheet switches at the same width. */
export const NARROW_QUERY = '(max-width: 600px)';
