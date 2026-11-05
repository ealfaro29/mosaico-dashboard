const paths = {
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9l10-6Z"/><path d="m3 14 9 5 9-5M3 18l9 5 9-5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',
 settings:'<path d="m9 4 .8-2h4.4l.8 2 2 .9 2.2-.3 2.2 3.8-1.4 1.8v2.4l1.4 1.8-2.2 3.8-2.2-.3-2 .9-.8 2H9.8l-.8-2-2-.9-2.2.3-2.2-3.8L4 12.6v-2.4L2.6 8.4l2.2-3.8 2.2.3 2-.9Z"/><circle cx="12" cy="11.5" r="3"/>',
 sliders:'<path d="M4 7h8m4 0h4M4 17h3m4 0h9"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',shrink:'<path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
 cloud:'<path d="M6 18a4 4 0 0 1-.7-7.9A6 6 0 0 1 17 8a5 5 0 1 1 1 10H6Z"/>',rain:'<path d="M5 15a4 4 0 0 1 .3-7 6 6 0 0 1 11.4-1A4.5 4.5 0 0 1 19 15M8 18l-1 3m6-3-1 3m6-3-1 3"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',external:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
 exchange:'<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',note:'<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M14 3v7h7M14 3l7 7M7 14h6m-6 3h9"/>',
 news:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 8h10M7 12h4m-4 4h4M14 12h3m-3 4h3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',checklist:'<path d="m3 6 2 2 3-4m3 3h10M3 13l2 2 3-4m3 3h10M3 20l2 2 3-4m3 3h10"/>',
 focus:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6m-3 0v3m6 1 2-2"/>',link:'<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
 chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 'hard-drive':'<path d="m5 3-3 9v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7l-3-9H5ZM2 12h20M6 16h.01M10 16h.01"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/>',upload:'<path d="M12 15V3m-5 5 5-5 5 5M3 16v5h18v-5"/>',rotate:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',grip:'<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
 wind:'<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3"/>',drop:'<path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>',play:'<path d="m8 4 12 8-12 8V4Z"/>',pause:'<path d="M8 4v16M16 4v16"/>',moon:'<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11Z"/>'
};
export function icon(name, cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`; }
