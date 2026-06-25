/**
 * The four actively-iterated reward icons, kept as TS consts (not ?raw assets) so edits
 * hot-reload reliably. Same contract as the asset slots: stroke="currentColor",
 * fill="none", a viewBox, no width/height, no hardcoded colours (the app tints + glows).
 */

// 10% — a two-end pencil/ink eraser: rectangle with opposite-corner bevels + a diagonal split.
export const eraser = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M56 60 L112 60 L112 82 L96 98 L40 98 L40 76 Z"/><line x1="74" y1="60" x2="90" y2="98"/><path d="M40 76 L56 60 M112 82 L96 98" opacity="0.45"/></g></svg>`;

// 25% — the woven finger-trap barrel: flared end rims + an X/diamond weave. No end nubs.
export const trap = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="42" cy="65" rx="5" ry="16"/><ellipse cx="118" cy="65" rx="5" ry="16"/><path d="M42 49 Q80 58 118 49"/><path d="M42 81 Q80 72 118 81"/><path d="M48 50 L64 80 M58 49 L74 79 M68 49 L84 79 M78 49 L94 79 M88 50 L104 78 M98 51 L112 75"/><path d="M48 80 L64 50 M58 81 L74 51 M68 81 L84 51 M78 81 L94 51 M88 80 L104 52 M98 79 L112 55"/></g></svg>`;

// 50% — a carved melon head on a platter.
export const melon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="80" cy="119" rx="44" ry="6"/><path d="M48 60 Q48 28 80 26 Q112 28 112 60 Q112 93 95 106 Q80 116 65 106 Q48 93 48 60 Z"/><path d="M50 50 Q52 35 66 34 Q80 29 94 34 Q108 35 110 50"/><path d="M53 48 q6 -8 13 -2 q7 -8 14 -2 q7 -7 14 2"/><circle cx="65" cy="42" r="1.5"/><circle cx="80" cy="39" r="1.5"/><circle cx="95" cy="42" r="1.5"/><path d="M48 64 q-7 1 -7 11 q3 5 8 2"/><path d="M112 64 q7 1 7 11 q-3 5 -8 2"/><path d="M57 60 q8 -4 15 -1"/><path d="M88 59 q7 -3 15 1"/><path d="M58 67 q7 4 14 1"/><path d="M88 67 q7 3 14 -1"/><path d="M80 64 L77 82 Q80 86 83 82"/><path d="M76 82 q-2 2 -1 3 M84 82 q2 2 1 3"/><path d="M68 95 Q80 103 92 95"/><path d="M71 98 Q80 101 89 98" opacity="0.6"/></g></svg>`;

// 75% — Music Dance Experience: a marching drum with tension rods, crossed sticks, a note.
export const mde = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="60" cy="60" rx="32" ry="11"/><line x1="28" y1="60" x2="28" y2="86"/><line x1="92" y1="60" x2="92" y2="86"/><path d="M28 86 Q60 99 92 86"/><line x1="42" y1="57" x2="42" y2="92"/><line x1="60" y1="53" x2="60" y2="96"/><line x1="78" y1="57" x2="78" y2="92"/><line x1="34" y1="40" x2="94" y2="58"/><line x1="38" y1="58" x2="98" y2="40"/><circle cx="94" cy="58" r="2.5"/><circle cx="98" cy="40" r="2.5"/><circle cx="122" cy="98" r="6"/><line x1="128" y1="98" x2="128" y2="72"/><path d="M128 72 q12 2 9 14"/></g></svg>`;
