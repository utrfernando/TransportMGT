import React from 'react';

/** Flat vehicle illustrations used when a listing has no photo, and as hero artwork. Pure SVG, no external images. */
type Kind = 'bus' | 'van' | 'three_wheeler' | 'other';
const NAVY = '#12214b', NAVY2 = '#1d3166', AMBER = '#fbbf24', AMBER2 = '#f59e0b', GLASS = '#dbeafe', TYRE = '#0a1530', HUB = '#94a3b8';

const Wheel: React.FC<{ cx: number; cy: number; r?: number }> = ({ cx, cy, r = 17 }) => (
  <g><circle cx={cx} cy={cy} r={r} fill={TYRE} /><circle cx={cx} cy={cy} r={r * 0.48} fill={HUB} /><circle cx={cx} cy={cy} r={r * 0.16} fill={TYRE} /></g>
);

const Bus: React.FC = () => (
  <svg viewBox="0 0 360 150" role="img" aria-label="Bus" className="w-full h-full">
    <ellipse cx="180" cy="141" rx="158" ry="6" fill="#0a1530" opacity=".18" />
    <rect x="10" y="18" width="334" height="104" rx="18" fill={AMBER} />
    <rect x="10" y="18" width="334" height="10" rx="5" fill={AMBER2} />
    <rect x="10" y="90" width="334" height="14" fill={NAVY2} />
    {Array.from({ length: 6 }).map((_, i) => <rect key={i} x={24 + i * 38} y="36" width="30" height="36" rx="6" fill={GLASS} />)}
    <rect x="252" y="34" width="28" height="68" rx="4" fill="#93c5fd" /><line x1="266" y1="34" x2="266" y2="102" stroke={NAVY2} strokeWidth="2" />
    <path d="M296 34h34a10 10 0 0 1 10 10v36a4 4 0 0 1-4 4h-40z" fill={GLASS} />
    <rect x="338" y="96" width="10" height="18" rx="4" fill={NAVY} /><circle cx="334" cy="108" r="5" fill="#fff7d6" />
    <rect x="12" y="104" width="326" height="8" fill={NAVY} opacity=".12" />
    <Wheel cx={78} cy={122} /><Wheel cx={282} cy={122} />
  </svg>
);

const Van: React.FC = () => (
  <svg viewBox="0 0 330 150" role="img" aria-label="Van" className="w-full h-full">
    <ellipse cx="165" cy="141" rx="140" ry="6" fill="#0a1530" opacity=".18" />
    <path d="M14 40a14 14 0 0 1 14-14h176a24 24 0 0 1 17 7l34 34c5 5 12 8 19 9l24 4a10 10 0 0 1 8 10v28a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6z" fill="#f8fafc" stroke={NAVY2} strokeWidth="3" />
    <path d="M14 92h300v14H14z" fill={NAVY2} />
    <rect x="30" y="42" width="52" height="30" rx="6" fill={GLASS} /><rect x="92" y="42" width="52" height="30" rx="6" fill={GLASS} /><rect x="154" y="42" width="44" height="30" rx="6" fill={GLASS} />
    <path d="M214 40l30 30h-30z" fill={GLASS} />
    <line x1="150" y1="30" x2="150" y2="92" stroke={NAVY2} strokeWidth="2" opacity=".5" />
    <rect x="14" y="26" width="200" height="6" rx="3" fill={AMBER} />
    <circle cx="316" cy="96" r="5" fill="#fff7d6" /><rect x="304" y="108" width="20" height="8" rx="3" fill={NAVY} />
    <Wheel cx={82} cy={122} /><Wheel cx={246} cy={122} />
  </svg>
);

const TukTuk: React.FC = () => (
  <svg viewBox="0 0 260 150" role="img" aria-label="Tuk tuk" className="w-full h-full">
    <ellipse cx="130" cy="141" rx="105" ry="6" fill="#0a1530" opacity=".18" />
    <path d="M40 54a28 28 0 0 1 28-28h82a40 40 0 0 1 36 22l12 24H40z" fill={AMBER} />
    <rect x="40" y="70" width="158" height="6" fill={AMBER2} />
    <rect x="46" y="76" width="5" height="40" fill={NAVY2} /><rect x="134" y="76" width="5" height="40" fill={NAVY2} />
    <rect x="52" y="86" width="82" height="26" rx="6" fill={NAVY2} />
    <path d="M150 76h40l14 18v22a6 6 0 0 1-6 6h-48z" fill="#f8fafc" stroke={NAVY2} strokeWidth="3" />
    <path d="M154 80h30l10 14h-40z" fill={GLASS} />
    <rect x="48" y="112" width="150" height="8" rx="3" fill={NAVY} />
    <circle cx="214" cy="104" r="5" fill="#fff7d6" />
    <Wheel cx={78} cy={124} r={15} /><Wheel cx={162} cy={124} r={15} /><Wheel cx={226} cy={126} r={12} />
  </svg>
);

const VehicleArt: React.FC<{ kind: Kind; className?: string }> = ({ kind, className }) => (
  <div className={className}>{kind === 'van' ? <Van /> : kind === 'three_wheeler' ? <TukTuk /> : <Bus />}</div>
);

export default VehicleArt;
