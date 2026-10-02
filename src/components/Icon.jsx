// Set ikon sendiri (grid 24, garis 1.75). Tanpa emoji dan tanpa pustaka ikon pihak ketiga.
const P = {
  play: { fill: true, d: 'M7.5 4.6v14.8L19.6 12z' },
  pause: { fill: true, d: 'M6.5 4.5h3.6v15H6.5zM13.9 4.5h3.6v15h-3.6z' },
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.1-4.1',
  home: 'M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  bookmark: 'M6.5 4h11v16.5L12 16.6l-5.5 3.9z',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  user: 'M12 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 20c.8-3.6 3.8-5.5 7-5.5s6.2 1.9 7 5.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevL: 'm15 5-7 7 7 7',
  chevR: 'm9 5 7 7-7 7',
  chevD: 'm6 9 6 6 6-6',
  star: { fill: true, d: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z' },
  volume: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16 9c1.4 1.1 1.4 4.9 0 6M18.6 6.4c3.1 2.6 3.1 8.6 0 11.2',
  mute: 'M4 9.5v5h3.5l5 4v-13l-5 4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitfs: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  cc: 'M5 5.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM10.2 10.3a2.3 2.3 0 1 0 0 3.4M17.2 10.3a2.3 2.3 0 1 0 0 3.4',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  back10: 'M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.6 4.2v4.2H8.8',
  fwd10: 'M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.4 4.2v4.2h-4.2',
  next: { fill: true, d: 'M5.5 5.5v13L15 12zM17 5.5h2.2v13H17z' },
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 8v.01',
  alert: 'M12 4 3 19.5h18zM12 10v4.5M12 17v.01',
  mail: 'M5 5.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM4 8l8 5.5L20 8',
  phone: 'M6.6 4h3l1.5 4-2 1.3a10 10 0 0 0 5.6 5.6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.6 6.2 2 2 0 0 1 6.6 4z',
  shield: 'M12 3.5 5 6v5.5c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6zM9 12l2.2 2.2L15 10',
  logout: 'M10 4H5.5v16H10M15 8l4 4-4 4M19 12H9',
  card: 'M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM3 10h18M7 15h3',
  refresh: 'M4 12a8 8 0 0 1 14-5.2M20 4v4h-4M20 12a8 8 0 0 1-14 5.2M4 20v-4h4',
  copy: 'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  external: 'M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  users: 'M9 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3.5 19c.6-3 3-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.2a3 3 0 0 1 0 5.6M18 14.8c1.7.6 2.7 2 3 4.2',
  chart: 'M5 20v-8M12 20V5M19 20V9',
  receipt: 'M6 3.5h12v17l-3-2-3 2-3-2-3 2zM9 8.5h6M9 12h6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  log: 'M6 3.5h8.5L19 8v12.5H6zM14 3.5V8.5h5M9 12.5h7M9 16h7',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10.5 11v6M13.5 11v6',
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3',
  film: 'M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4',
  crown: 'M4 18.5h16M5 17l-1-9 5 4 3-6 3 6 5-4-1 9z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l1.6 1-1.6 3-1.9-.4a6.5 6.5 0 0 1-1.7 1l-.6 1.9h-3.6l-.6-1.9a6.5 6.5 0 0 1-1.7-1l-1.9.4-1.6-3L5 12a6.5 6.5 0 0 1 0-2l-1.6-1 1.6-3 1.9.4a6.5 6.5 0 0 1 1.7-1L9.2 3.5h3.6l.6 1.9a6.5 6.5 0 0 1 1.7 1l1.9-.4 1.6 3L19 10a6.5 6.5 0 0 1 0 2z',
};

export function Icon({ name, className = '', ...rest }) {
  const def = P[name];
  if (!def) return null;
  const fill = typeof def === 'object' && def.fill;
  const d = typeof def === 'object' ? def.d : def;
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={d} />
    </svg>
  );
}
